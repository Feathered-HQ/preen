import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { buildDependencyGraph } from "../src/graph/index.js"
import { loadWorkspace } from "../src/workspace/index.js"

const fixtureRoot = path.resolve("tests/fixtures/graph-workspace")

test("loadWorkspace discovers configured slice projects deterministically", async () => {
	const workspace = await loadWorkspace(fixtureRoot)

	assert.equal(workspace.snapshotPath, ".preen/dependency-graph.snapshot.json")
	assert.deepEqual(
		workspace.projects.map((project) => project.slice.id),
		["common", "auth"],
	)
})

test("buildDependencyGraph records file, runtime, and type-only dependencies", async () => {
	const workspace = await loadWorkspace(fixtureRoot)
	const graph = await buildDependencyGraph(workspace)

	assert.deepEqual(graph.files, [
		{ id: "common/src/util.ts", slice: "common" },
		{ id: "slices/auth/src/login.ts", slice: "auth" },
		{ id: "slices/auth/src/user.ts", slice: "auth" },
	])
	assert.deepEqual(graph.edges, [
		{
			from: "slices/auth/src/login.ts",
			to: "common/src/util.ts",
			kind: "runtime",
		},
		{
			from: "slices/auth/src/login.ts",
			to: "slices/auth/src/user.ts",
			kind: "type",
		},
	])
	assert.deepEqual(graph.unresolvedImports, [])
})
