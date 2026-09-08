import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { parseSnapshot, serializeSnapshot, type DependencyGraph } from "../src/graph/index.js"

const fixtureRoot = path.resolve("tests/fixtures/graph-workspace")

const captureCli = async (args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
	const result = spawnSync(
		process.execPath,
		["--import", "tsx", "tests/helpers/run-cli.ts", ...args],
		{ cwd: path.resolve("."), encoding: "utf8" },
	)
	return {
		code: result.status ?? 2,
		stdout: result.stdout,
		stderr: result.stderr,
	}
}

test("snapshot writes deterministic graph and --check verifies it", { concurrency: false }, async () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "preen-graph-"))
	try {
		const output = path.join(temporary, "snapshot.json")
		const written = await captureCli([
			"snapshot",
			"--cwd",
			fixtureRoot,
			"--output",
			output,
		])
		assert.equal(written.code, 0, written.stderr)
		const original = fs.readFileSync(output, "utf8")
		assert.equal(parseSnapshot(original).files.length, 3)
		const rewritten = await captureCli([
			"snapshot",
			"--cwd",
			fixtureRoot,
			"--output",
			output,
		])
		assert.equal(rewritten.code, 0, rewritten.stderr)
		assert.equal(fs.readFileSync(output, "utf8"), original)
		assert.match(rewritten.stdout, /Dependency snapshot unchanged/)

		const checked = await captureCli([
			"snapshot",
			"--cwd",
			fixtureRoot,
			"--output",
			output,
			"--check",
		])
		assert.equal(checked.code, 0, checked.stderr)
		assert.match(checked.stdout, /Dependency snapshot is current/)

		fs.writeFileSync(output, serializeSnapshot({
			...parseSnapshot(original),
			edges: [],
		}))
		const stale = await captureCli([
			"snapshot",
			"--cwd",
			fixtureRoot,
			"--output",
			output,
			"--check",
		])
		assert.equal(stale.code, 1, stale.stderr)
		assert.match(stale.stdout, /Dependency snapshot is stale/)
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true })
	}
})

test("graph renders a focused file graph from a snapshot", { concurrency: false }, async () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "preen-graph-"))
	try {
		const output = path.join(temporary, "snapshot.json")
		assert.equal(
			(
				await captureCli([
					"snapshot",
					"--cwd",
					fixtureRoot,
					"--output",
					output,
				])
			).code,
			0,
		)
		const rendered = await captureCli([
			"graph",
			"--cwd",
			fixtureRoot,
			"--snapshot",
			output,
			"--scope",
			"slice:auth",
			"--granularity",
			"file",
		])
		assert.equal(rendered.code, 0, rendered.stderr)
		assert.match(rendered.stdout, /^flowchart LR/m)
		assert.match(rendered.stdout, /slices\/auth\/src\/login\.ts/)
		assert.match(rendered.stdout, /common/)
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true })
	}
})

test("graph diff renders added nodes green and removed nodes red", { concurrency: false }, async () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "preen-graph-"))
	const empty: DependencyGraph = {
		schemaVersion: 1,
		slices: [],
		files: [],
		edges: [],
		unresolvedImports: [],
	}
	try {
		const base = path.join(temporary, "base.json")
		const head = path.join(temporary, "head.json")
		fs.writeFileSync(base, serializeSnapshot(empty))
		assert.equal(
			(
				await captureCli([
					"snapshot",
					"--cwd",
					fixtureRoot,
					"--output",
					head,
				])
			).code,
			0,
		)
		const rendered = await captureCli([
			"graph",
			"diff",
			"--cwd",
			fixtureRoot,
			"--base",
			base,
			"--head",
			head,
			"--granularity",
			"slice",
		])
		assert.equal(rendered.code, 0, rendered.stderr)
		assert.match(rendered.stdout, /classDef added .*#16a34a/)
		assert.match(rendered.stdout, /\+ auth/)
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true })
	}
})

test("visualize rules preserves the configured rule graph", { concurrency: false }, async () => {
	const result = await captureCli([
		"visualize",
		"rules",
		"--cwd",
		path.join(fixtureRoot, "slices/auth"),
	])

	assert.equal(result.code, 0, result.stderr)
	assert.match(result.stdout, /^flowchart LR/m)
	assert.match(result.stdout, /src\/\*\*\/\*\.ts/)
})

test("graph diff can fail only when a new cycle is introduced", { concurrency: false }, async () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "preen-graph-"))
	const nodes: DependencyGraph = {
		schemaVersion: 1,
		slices: [{ id: "auth", root: "slices/auth" }],
		files: [
			{ id: "slices/auth/src/a.ts", slice: "auth" },
			{ id: "slices/auth/src/b.ts", slice: "auth" },
		],
		edges: [],
		unresolvedImports: [],
	}
	try {
		const base = path.join(temporary, "base.json")
		const head = path.join(temporary, "head.json")
		fs.writeFileSync(base, serializeSnapshot(nodes))
		fs.writeFileSync(
			head,
			serializeSnapshot({
				...nodes,
				edges: [
					{ from: "slices/auth/src/a.ts", to: "slices/auth/src/b.ts", kind: "runtime" },
					{ from: "slices/auth/src/b.ts", to: "slices/auth/src/a.ts", kind: "runtime" },
				],
			}),
		)
		const result = await captureCli([
			"graph",
			"diff",
			"--cwd",
			fixtureRoot,
			"--base",
			base,
			"--head",
			head,
			"--granularity",
			"file",
			"--fail-on",
			"new-cycles",
		])
		assert.equal(result.code, 1, result.stderr)
		assert.match(result.stderr, /new dependency cycle: slices\/auth\/src\/a\.ts, slices\/auth\/src\/b\.ts/)
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true })
	}
})

test("graph markdown includes health metrics and the Mermaid diagram", { concurrency: false }, async () => {
	const result = await captureCli([
		"graph",
		"--cwd",
		fixtureRoot,
		"--scope",
		"all",
		"--granularity",
		"slice",
		"--format",
		"markdown",
	])

	assert.equal(result.code, 0, result.stderr)
	assert.match(result.stdout, /\| Nodes \| 2 \|/)
	assert.match(result.stdout, /\| Dependencies \| 1 \|/)
	assert.match(result.stdout, /\| Cycles \| 0 \|/)
	assert.match(result.stdout, /```mermaid\nflowchart LR/)
})

test("graph can render stored snapshots without a workspace config", { concurrency: false }, async () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "preen-graph-"))
	try {
		const snapshot = path.join(temporary, "snapshot.json")
		fs.writeFileSync(
			snapshot,
			serializeSnapshot({
				schemaVersion: 1,
				slices: [{ id: "auth", root: "slices/auth" }],
				files: [{ id: "slices/auth/src/a.ts", slice: "auth" }],
				edges: [],
				unresolvedImports: [],
			}),
		)
		const result = await captureCli([
			"graph",
			"--cwd",
			temporary,
			"--snapshot",
			snapshot,
		])
		assert.equal(result.code, 0, result.stderr)
		assert.match(result.stdout, /auth/)
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true })
	}
})

test("graph accepts a directory scope with separate after and behind depths", { concurrency: false }, async () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "preen-graph-"))
	const graph: DependencyGraph = {
		schemaVersion: 1,
		slices: [{ id: "pkg", root: "pkg" }],
		files: [
			{ id: "pkg/src/feature/a.ts", slice: "pkg" },
			{ id: "pkg/src/b.ts", slice: "pkg" },
			{ id: "pkg/src/c.ts", slice: "pkg" },
			{ id: "pkg/src/d.ts", slice: "pkg" },
			{ id: "pkg/src/e.ts", slice: "pkg" },
		],
		edges: [
			{ from: "pkg/src/feature/a.ts", to: "pkg/src/b.ts", kind: "runtime" },
			{ from: "pkg/src/b.ts", to: "pkg/src/c.ts", kind: "runtime" },
			{ from: "pkg/src/d.ts", to: "pkg/src/feature/a.ts", kind: "runtime" },
			{ from: "pkg/src/e.ts", to: "pkg/src/d.ts", kind: "runtime" },
		],
		unresolvedImports: [],
	}
	try {
		const snapshot = path.join(temporary, "snapshot.json")
		fs.writeFileSync(snapshot, serializeSnapshot(graph))
		const result = await captureCli([
			"graph",
			"--cwd",
			temporary,
			"--snapshot",
			snapshot,
			"--scope",
			"path:pkg/src/feature",
			"--granularity",
			"file",
			"--after-depth",
			"1",
			"--behind-depth",
			"1",
			"--format",
			"json",
		])
		assert.equal(result.code, 0, result.stderr)
		assert.deepEqual(
			(JSON.parse(result.stdout) as { nodes: Array<{ id: string }> }).nodes.map(
				(node) => node.id,
			),
			["pkg/src/b.ts", "pkg/src/d.ts", "pkg/src/feature/a.ts"],
		)
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true })
	}
})

test("graph rejects unsafe path scopes, invalid depths, and empty directories", { concurrency: false }, async () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "preen-graph-"))
	try {
		const snapshot = path.join(temporary, "snapshot.json")
		fs.writeFileSync(
			snapshot,
			serializeSnapshot({
				schemaVersion: 1,
				slices: [{ id: "pkg", root: "pkg" }],
				files: [{ id: "pkg/src/a.ts", slice: "pkg" }],
				edges: [],
				unresolvedImports: [],
			}),
		)
		const unsafe = await captureCli([
			"graph", "--cwd", temporary, "--snapshot", snapshot,
			"--scope", "path:../outside",
		])
		assert.equal(unsafe.code, 2)
		assert.match(unsafe.stderr, /path scope must be repository-relative/)

		const invalidDepth = await captureCli([
			"graph", "--cwd", temporary, "--snapshot", snapshot,
			"--after-depth", "-1",
		])
		assert.equal(invalidDepth.code, 2)
		assert.match(invalidDepth.stderr, /invalid after depth: -1/)

		const empty = await captureCli([
			"graph", "--cwd", temporary, "--snapshot", snapshot,
			"--scope", "path:pkg/missing",
		])
		assert.equal(empty.code, 2)
		assert.match(empty.stderr, /graph scope contains no configured files: pkg\/missing/)
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true })
	}
})
