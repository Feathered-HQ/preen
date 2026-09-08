import type {
	DependencyGraph,
	GraphProjectionOptions,
	ProjectedEdge,
	ProjectedGraph,
	ProjectedNode,
} from "./graph-types.js"
import { normalizeGraph } from "./normalize-graph.js"

type Depth = number | "all"

const edgeKey = (edge: Pick<ProjectedEdge, "from" | "to" | "kind">): string =>
	`${edge.from}\0${edge.to}\0${edge.kind}`

const matchesPath = (fileId: string, targetPath: string): boolean =>
	fileId === targetPath || fileId.startsWith(`${targetPath}/`)

const traverse = (
	seeds: Set<string>,
	edges: ProjectedEdge[],
	direction: "after" | "behind",
	depth: Depth,
): Set<string> => {
	const visited = new Set(seeds)
	if (depth === 0) return visited
	const adjacency = new Map<string, string[]>()
	for (const edge of edges) {
		const from = direction === "after" ? edge.from : edge.to
		const to = direction === "after" ? edge.to : edge.from
		const targets = adjacency.get(from) ?? []
		targets.push(to)
		adjacency.set(from, targets)
	}
	const queue = [...seeds].map((id) => ({ id, distance: 0 }))
	for (let index = 0; index < queue.length; index += 1) {
		const current = queue[index]!
		if (depth !== "all" && current.distance >= depth) continue
		for (const target of adjacency.get(current.id) ?? []) {
			if (visited.has(target)) continue
			visited.add(target)
			queue.push({ id: target, distance: current.distance + 1 })
		}
	}
	return visited
}

const selectReachable = (
	nodes: ProjectedNode[],
	edges: ProjectedEdge[],
	seeds: Set<string>,
	options: GraphProjectionOptions,
): ProjectedGraph => {
	if (options.scope.type === "all") return { nodes, edges }
	const after = traverse(seeds, edges, "after", options.afterDepth ?? "all")
	const behind = traverse(seeds, edges, "behind", options.behindDepth ?? 0)
	const included = new Set([...after, ...behind])
	return {
		nodes: nodes.filter((node) => included.has(node.id)),
		edges: edges.filter(
			(edge) => included.has(edge.from) && included.has(edge.to),
		),
	}
}

const fileProjection = (
	graph: DependencyGraph,
	options: GraphProjectionOptions,
): ProjectedGraph => {
	const nodes: ProjectedNode[] = graph.files.map((file) => ({
		id: file.id,
		kind: "file",
		slice: file.slice,
	}))
	const edges: ProjectedEdge[] = graph.edges.map((edge) => ({ ...edge, count: 1 }))
	const seeds = new Set<string>()
	for (const file of graph.files) {
		if (
			options.scope.type === "all" ||
			(options.scope.type === "slice" && file.slice === options.scope.id) ||
			(options.scope.type === "path" && matchesPath(file.id, options.scope.path))
		) {
			seeds.add(file.id)
		}
	}
	return selectReachable(nodes, edges, seeds, options)
}

const sliceProjection = (
	graph: DependencyGraph,
	options: GraphProjectionOptions,
): ProjectedGraph => {
	const nodes: ProjectedNode[] = graph.slices.map((slice) => ({
		id: slice.id,
		kind: "slice",
		slice: slice.id,
	}))
	const files = new Map(graph.files.map((file) => [file.id, file]))
	const aggregated = new Map<string, ProjectedEdge>()
	for (const edge of graph.edges) {
		const from = files.get(edge.from)?.slice
		const to = files.get(edge.to)?.slice
		if (from === undefined || to === undefined || from === to) continue
		const key = edgeKey({ from, to, kind: edge.kind })
		const existing = aggregated.get(key)
		if (existing === undefined) {
			aggregated.set(key, { from, to, kind: edge.kind, count: 1 })
		} else {
			existing.count += 1
		}
	}
	const edges = [...aggregated.values()].sort((a, b) =>
		edgeKey(a).localeCompare(edgeKey(b)),
	)
	const seeds = new Set<string>()
	if (options.scope.type === "all") {
		for (const node of nodes) seeds.add(node.id)
	} else if (options.scope.type === "slice") {
		seeds.add(options.scope.id)
	} else {
		for (const file of graph.files) {
			if (matchesPath(file.id, options.scope.path)) seeds.add(file.slice)
		}
	}
	return selectReachable(nodes, edges, seeds, options)
}

export const projectGraph = (
	input: DependencyGraph,
	options: GraphProjectionOptions,
): ProjectedGraph => {
	const graph = normalizeGraph(input)
	const projected =
		options.granularity === "file"
			? fileProjection(graph, options)
			: sliceProjection(graph, options)
	return {
		nodes: projected.nodes.sort((a, b) => a.id.localeCompare(b.id)),
		edges: projected.edges.sort((a, b) => edgeKey(a).localeCompare(edgeKey(b))),
	}
}
