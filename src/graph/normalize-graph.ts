import type { DependencyGraph, GraphEdge } from "./graph-types.js"

const posix = (value: string): string => value.replaceAll("\\", "/")
const edgeKey = (edge: GraphEdge): string =>
	`${edge.from}\0${edge.to}\0${edge.kind}`

export const normalizeGraph = (graph: DependencyGraph): DependencyGraph => {
	const edges = new Map<string, GraphEdge>()
	for (const source of graph.edges) {
		const edge = {
			from: posix(source.from),
			to: posix(source.to),
			kind: source.kind,
		}
		edges.set(edgeKey(edge), edge)
	}
	return {
		schemaVersion: graph.schemaVersion,
		slices: graph.slices
			.map((slice) => ({ id: slice.id, root: posix(slice.root) }))
			.sort((a, b) => a.id.localeCompare(b.id) || a.root.localeCompare(b.root)),
		files: graph.files
			.map((file) => ({ id: posix(file.id), slice: file.slice }))
			.sort((a, b) => a.id.localeCompare(b.id)),
		edges: [...edges.values()].sort((a, b) =>
			edgeKey(a).localeCompare(edgeKey(b)),
		),
		unresolvedImports: graph.unresolvedImports
			.map((item) => ({ from: posix(item.from), specifier: item.specifier }))
			.sort(
				(a, b) =>
					a.from.localeCompare(b.from) || a.specifier.localeCompare(b.specifier),
			),
	}
}
