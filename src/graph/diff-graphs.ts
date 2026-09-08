import type {
	DependencyGraph,
	GraphDiff,
	GraphEdge,
	GraphStatus,
	ProjectedGraph,
	ProjectedGraphDiff,
} from "./graph-types.js"
import { normalizeGraph } from "./normalize-graph.js"

const edgeKey = (edge: GraphEdge): string =>
	`${edge.from}\0${edge.to}\0${edge.kind}`

const statusFor = (
	inBase: boolean,
	inCurrent: boolean,
): GraphStatus => {
	if (!inBase) return "added"
	if (!inCurrent) return "removed"
	return "unchanged"
}

export const diffProjectedGraphs = (
	base: ProjectedGraph,
	current: ProjectedGraph,
): ProjectedGraphDiff => {
	const baseNodes = new Map(base.nodes.map((node) => [node.id, node]))
	const currentNodes = new Map(current.nodes.map((node) => [node.id, node]))
	const nodeIds = [...new Set([...baseNodes.keys(), ...currentNodes.keys()])].sort()
	const baseEdges = new Map(base.edges.map((edge) => [edgeKey(edge), edge]))
	const currentEdges = new Map(
		current.edges.map((edge) => [edgeKey(edge), edge]),
	)
	const edgeIds = [...new Set([...baseEdges.keys(), ...currentEdges.keys()])].sort()

	return {
		nodes: nodeIds.map((id) => ({
			...(currentNodes.get(id) ?? baseNodes.get(id)!),
			status: statusFor(baseNodes.has(id), currentNodes.has(id)),
		})),
		edges: edgeIds.map((id) => {
			const baseEdge = baseEdges.get(id)
			const currentEdge = currentEdges.get(id)
			const edge = currentEdge ?? baseEdge!
			return {
				from: edge.from,
				to: edge.to,
				kind: edge.kind,
				status: statusFor(baseEdge !== undefined, currentEdge !== undefined),
				baseCount: baseEdge?.count ?? 0,
				currentCount: currentEdge?.count ?? 0,
			}
		}),
	}
}

export const diffGraphs = (
	baseInput: DependencyGraph,
	currentInput: DependencyGraph,
): GraphDiff => {
	const base = normalizeGraph(baseInput)
	const current = normalizeGraph(currentInput)
	const baseFiles = new Map(base.files.map((file) => [file.id, file]))
	const currentFiles = new Map(current.files.map((file) => [file.id, file]))
	const fileIds = [...new Set([...baseFiles.keys(), ...currentFiles.keys()])].sort()

	const baseEdges = new Map(base.edges.map((edge) => [edgeKey(edge), edge]))
	const currentEdges = new Map(
		current.edges.map((edge) => [edgeKey(edge), edge]),
	)
	const edgeIds = [...new Set([...baseEdges.keys(), ...currentEdges.keys()])].sort()

	return {
		nodes: fileIds.map((id) => {
			const file = currentFiles.get(id) ?? baseFiles.get(id)!
			return {
				...file,
				status: statusFor(baseFiles.has(id), currentFiles.has(id)),
			}
		}),
		edges: edgeIds.map((id) => {
			const edge = currentEdges.get(id) ?? baseEdges.get(id)!
			return {
				...edge,
				status: statusFor(baseEdges.has(id), currentEdges.has(id)),
			}
		}),
	}
}
