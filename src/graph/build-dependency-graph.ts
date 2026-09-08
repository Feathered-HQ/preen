import path from "node:path"
import { glob } from "tinyglobby"
import { extractImports } from "../checkers/independent-modules/extract-imports.js"
import { createResolver } from "../checkers/independent-modules/create-resolver.js"
import { parseSourceFile } from "../checkers/naming-rules/parse-source-file.js"
import type { LoadedWorkspace } from "../workspace/load-workspace.js"
import {
	DEPENDENCY_GRAPH_SCHEMA_VERSION,
	type DependencyGraph,
	type GraphFile,
} from "./graph-types.js"
import { normalizeGraph } from "./normalize-graph.js"

const absoluteKey = (value: string): string =>
	path.resolve(value).split(path.sep).join("/").toLowerCase()
const relativePosix = (from: string, value: string): string =>
	path.relative(from, value).split(path.sep).join("/")

export const buildDependencyGraph = async (
	workspace: LoadedWorkspace,
): Promise<DependencyGraph> => {
	const claimedFiles = new Map<
		string,
		{ absolute: string; file: GraphFile; projectIndex: number }
	>()

	for (const [projectIndex, project] of workspace.projects.entries()) {
		const matches = await glob(project.config.include, {
			cwd: project.cwd,
			absolute: true,
			ignore: project.config.ignorePatterns,
			dot: false,
			onlyFiles: true,
		})
		for (const absolute of matches) {
			const key = absoluteKey(absolute)
			if (claimedFiles.has(key)) {
				throw new Error(`source file is claimed by multiple slices: ${absolute}`)
			}
			claimedFiles.set(key, {
				absolute,
				file: {
					id: relativePosix(workspace.root, absolute),
					slice: project.slice.id,
				},
				projectIndex,
			})
		}
	}

	const graph: DependencyGraph = {
		schemaVersion: DEPENDENCY_GRAPH_SCHEMA_VERSION,
		slices: workspace.projects.map((project) => project.slice),
		files: [...claimedFiles.values()].map((item) => item.file),
		edges: [],
		unresolvedImports: [],
	}
	const resolvers = workspace.projects.map((project) =>
		createResolver({ cwd: project.cwd, tsconfig: project.config.tsconfig }),
	)

	for (const item of claimedFiles.values()) {
		const parsed = parseSourceFile(item.absolute)
		for (const importSite of extractImports(parsed.program)) {
			const resolved = resolvers[item.projectIndex]!.resolve(
				item.absolute,
				importSite.source,
			)
			if ("external" in resolved) continue
			if ("error" in resolved) {
				if (
					importSite.source.startsWith(".") ||
					importSite.source.startsWith("/")
				) {
					graph.unresolvedImports.push({
						from: item.file.id,
						specifier: importSite.source,
					})
				}
				continue
			}
			const target = claimedFiles.get(absoluteKey(resolved.resolved))
			if (target === undefined) continue
			graph.edges.push({
				from: item.file.id,
				to: target.file.id,
				kind: importSite.kind,
			})
		}
	}

	return normalizeGraph(graph)
}
