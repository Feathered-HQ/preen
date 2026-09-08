import assert from "node:assert/strict"
import test from "node:test"
import { vsaPackage } from "../src/presets/vsaPackage.js"
import { defineWorkspace } from "../src/index.js"
import {
	analyzeGraphHealth,
	diffGraphs,
	diffProjectedGraphs,
	normalizeGraph,
	parseSnapshot,
	projectGraph,
	renderGraphDiffMermaid,
	serializeSnapshot,
	type DependencyGraph,
} from "../src/graph/index.js"

const baseGraph: DependencyGraph = {
	schemaVersion: 1,
	slices: [
		{ id: "auth", root: "slices/auth" },
		{ id: "common", root: "common" },
	],
	files: [
		{ id: "slices/auth/src/login.ts", slice: "auth" },
		{ id: "common/src/session.ts", slice: "common" },
		{ id: "common/src/legacy.ts", slice: "common" },
	],
	edges: [
		{
			from: "slices/auth/src/login.ts",
			to: "common/src/legacy.ts",
			kind: "runtime",
		},
	],
	unresolvedImports: [],
}

const currentGraph: DependencyGraph = {
	schemaVersion: 1,
	slices: [...baseGraph.slices].reverse(),
	files: [
		{ id: "common/src/session.ts", slice: "common" },
		{ id: "slices/auth/src/login.ts", slice: "auth" },
		{ id: "slices/auth/src/register.ts", slice: "auth" },
	],
	edges: [
		{
			from: "slices/auth/src/login.ts",
			to: "common/src/session.ts",
			kind: "runtime",
		},
	],
	unresolvedImports: [],
}

test("normalizeGraph produces stable sorted output and removes duplicate edges", () => {
	const normalized = normalizeGraph({
		...currentGraph,
		edges: [...currentGraph.edges, currentGraph.edges[0]!],
	})

	assert.deepEqual(
		normalized.slices.map((slice) => slice.id),
		["auth", "common"],
	)
	assert.deepEqual(
		normalized.files.map((file) => file.id),
		[
			"common/src/session.ts",
			"slices/auth/src/login.ts",
			"slices/auth/src/register.ts",
		],
	)
	assert.equal(normalized.edges.length, 1)
})

test("diffGraphs classifies added and removed files and dependencies", () => {
	const diff = diffGraphs(baseGraph, currentGraph)

	assert.deepEqual(
		diff.nodes.filter((node) => node.status !== "unchanged"),
		[
			{
				id: "common/src/legacy.ts",
				slice: "common",
				status: "removed",
			},
			{
				id: "slices/auth/src/register.ts",
				slice: "auth",
				status: "added",
			},
		],
	)
	assert.deepEqual(
		diff.edges.map(({ from, to, status }) => ({ from, to, status })),
		[
			{
				from: "slices/auth/src/login.ts",
				to: "common/src/legacy.ts",
				status: "removed",
			},
			{
				from: "slices/auth/src/login.ts",
				to: "common/src/session.ts",
				status: "added",
			},
		],
	)
})

test("projectGraph aggregates file dependencies into slice dependencies", () => {
	const projected = projectGraph(currentGraph, {
		scope: { type: "all" },
		granularity: "slice",
	})

	assert.deepEqual(
		projected.nodes.map((node) => node.id),
		["auth", "common"],
	)
	assert.deepEqual(projected.edges, [
		{ from: "auth", to: "common", kind: "runtime", count: 1 },
	])
})

test("projectGraph follows all outgoing file dependencies for a focused slice by default", () => {
	const projected = projectGraph(currentGraph, {
		scope: { type: "slice", id: "auth" },
		granularity: "file",
	})

	assert.deepEqual(
		projected.nodes.map((node) => ({ id: node.id, kind: node.kind })),
		[
			{ id: "common/src/session.ts", kind: "file" },
			{ id: "slices/auth/src/login.ts", kind: "file" },
			{ id: "slices/auth/src/register.ts", kind: "file" },
		],
	)
	assert.deepEqual(projected.edges, [
		{
			from: "slices/auth/src/login.ts",
			to: "common/src/session.ts",
			kind: "runtime",
			count: 1,
		},
	])
})

test("projectGraph scopes to a directory and applies outgoing and incoming depths", () => {
	const graph: DependencyGraph = {
		schemaVersion: 1,
		slices: [
			{ id: "auth", root: "slices/auth" },
			{ id: "common", root: "common" },
		],
		files: [
			{ id: "slices/auth/src/client/a.ts", slice: "auth" },
			{ id: "common/src/b.ts", slice: "common" },
			{ id: "common/src/c.ts", slice: "common" },
			{ id: "slices/auth/src/server/d.ts", slice: "auth" },
			{ id: "slices/auth/src/server/e.ts", slice: "auth" },
		],
		edges: [
			{ from: "slices/auth/src/client/a.ts", to: "common/src/b.ts", kind: "runtime" },
			{ from: "common/src/b.ts", to: "common/src/c.ts", kind: "runtime" },
			{ from: "slices/auth/src/server/d.ts", to: "slices/auth/src/client/a.ts", kind: "runtime" },
			{ from: "slices/auth/src/server/e.ts", to: "slices/auth/src/server/d.ts", kind: "runtime" },
		],
		unresolvedImports: [],
	}

	const projected = projectGraph(graph, {
		scope: { type: "path", path: "slices/auth/src/client" },
		granularity: "file",
		afterDepth: 1,
		behindDepth: 1,
	})

	assert.deepEqual(
		projected.nodes.map((node) => node.id),
		[
			"common/src/b.ts",
			"slices/auth/src/client/a.ts",
			"slices/auth/src/server/d.ts",
		],
	)
	assert.deepEqual(
		projected.edges.map((edge) => [edge.from, edge.to]),
		[
			["slices/auth/src/client/a.ts", "common/src/b.ts"],
			["slices/auth/src/server/d.ts", "slices/auth/src/client/a.ts"],
		],
	)
})

test("projectGraph accepts all outgoing depth and zero incoming depth", () => {
	const graph: DependencyGraph = {
		...currentGraph,
		files: [
			...currentGraph.files,
			{ id: "common/src/deep.ts", slice: "common" },
			{ id: "slices/auth/src/consumer.ts", slice: "auth" },
		],
		edges: [
			...currentGraph.edges,
			{ from: "common/src/session.ts", to: "common/src/deep.ts", kind: "runtime" },
			{ from: "slices/auth/src/consumer.ts", to: "slices/auth/src/login.ts", kind: "runtime" },
		],
	}
	const projected = projectGraph(graph, {
		scope: { type: "path", path: "slices/auth/src/login.ts" },
		granularity: "file",
		afterDepth: "all",
		behindDepth: 0,
	})
	assert.deepEqual(
		projected.nodes.map((node) => node.id),
		[
			"common/src/deep.ts",
			"common/src/session.ts",
			"slices/auth/src/login.ts",
		],
	)
})

test("renderGraphDiffMermaid marks additions green and removals red", () => {
	const mermaid = renderGraphDiffMermaid(diffGraphs(baseGraph, currentGraph))

	assert.match(mermaid, /classDef added .*#16a34a/)
	assert.match(mermaid, /classDef removed .*#dc2626/)
	assert.match(mermaid, /\+ slices\/auth\/src\/register\.ts/)
	assert.match(mermaid, /− common\/src\/legacy\.ts/)
	assert.match(mermaid, /stroke:#16a34a/)
	assert.match(mermaid, /stroke:#dc2626/)
})

test("diffProjectedGraphs keeps a slice relationship unchanged when its files change", () => {
	const base = projectGraph(baseGraph, {
		scope: { type: "all" },
		granularity: "slice",
	})
	const current = projectGraph(currentGraph, {
		scope: { type: "all" },
		granularity: "slice",
	})

	const diff = diffProjectedGraphs(base, current)
	assert.deepEqual(diff.edges, [
		{
			from: "auth",
			to: "common",
			kind: "runtime",
			status: "unchanged",
			baseCount: 1,
			currentCount: 1,
		},
	])
})

test("snapshot serialization is deterministic and validates its schema", () => {
	const serialized = serializeSnapshot(currentGraph)
	assert.equal(serialized, `${JSON.stringify(normalizeGraph(currentGraph), null, 2)}\n`)
	assert.deepEqual(parseSnapshot(serialized), normalizeGraph(currentGraph))
	assert.throws(
		() => parseSnapshot('{"schemaVersion":2}'),
		/unsupported dependency graph schema version: 2/,
	)
})

test("analyzeGraphHealth reports cycles and dependency hotspots", () => {
	const health = analyzeGraphHealth({
		nodes: [
			{ id: "a", kind: "slice" },
			{ id: "b", kind: "slice" },
			{ id: "c", kind: "slice" },
			{ id: "d", kind: "slice" },
		],
		edges: [
			{ from: "a", to: "b", kind: "runtime", count: 1 },
			{ from: "b", to: "a", kind: "runtime", count: 1 },
			{ from: "c", to: "a", kind: "runtime", count: 1 },
			{ from: "b", to: "d", kind: "runtime", count: 1 },
		],
	})

	assert.deepEqual(health.cycles, [["a", "b"]])
	assert.deepEqual(health.highestFanIn, { id: "a", count: 2 })
	assert.deepEqual(health.highestFanOut, { id: "b", count: 2 })
	assert.equal(health.nodeCount, 4)
	assert.equal(health.edgeCount, 4)
})

test("analyzeGraphHealth treats a self dependency as a cycle", () => {
	const health = analyzeGraphHealth({
		nodes: [{ id: "a", kind: "file" }],
		edges: [{ from: "a", to: "a", kind: "runtime", count: 1 }],
	})
	assert.deepEqual(health.cycles, [["a"]])
})

test("vsaPackage exposes a default or overridden graph slice id", () => {
	assert.deepEqual(vsaPackage({ path: "slices/auth" }).graph, {
		sliceId: "auth",
	})
	assert.deepEqual(
		vsaPackage({ path: "slices/auth", graph: { sliceId: "identity" } }).graph,
		{ sliceId: "identity" },
	)
})

test("defineWorkspace is available from the package entry point", () => {
	assert.deepEqual(defineWorkspace({ projects: ["slices/*/preen.config.ts"] }), {
		projects: ["slices/*/preen.config.ts"],
	})
})
