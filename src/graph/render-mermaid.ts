import type {
	GraphDiff,
	GraphStatus,
	ProjectedGraph,
	ProjectedGraphDiff,
} from "./graph-types.js"

const hash = (value: string): string => {
	let result = 2166136261
	for (let index = 0; index < value.length; index += 1) {
		result ^= value.charCodeAt(index)
		result = Math.imul(result, 16777619)
	}
	return `n${(result >>> 0).toString(16)}`
}

const escapeLabel = (value: string): string =>
	value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")

const prefixFor = (status: GraphStatus): string => {
	if (status === "added") return "+ "
	if (status === "removed") return "− "
	return ""
}

type RenderableDiff = GraphDiff | ProjectedGraphDiff

export const renderGraphDiffMermaid = (diff: RenderableDiff): string => {
	const lines = ["flowchart LR"]
	for (const node of diff.nodes) {
		lines.push(
			`  ${hash(node.id)}["${escapeLabel(`${prefixFor(node.status)}${node.id}`)}"]:::${node.status}`,
		)
	}
	const linkStyles: string[] = []
	diff.edges.forEach((edge, index) => {
		const arrow = edge.status === "removed" ? "-.->" : "-->"
		lines.push(`  ${hash(edge.from)} ${arrow} ${hash(edge.to)}`)
		if (edge.status === "added") {
			linkStyles.push(
				`  linkStyle ${index} stroke:#16a34a,stroke-width:3px`,
			)
		} else if (edge.status === "removed") {
			linkStyles.push(
				`  linkStyle ${index} stroke:#dc2626,stroke-width:2px,stroke-dasharray:5 5`,
			)
		}
	})
	lines.push(
		"  classDef unchanged fill:#f3f4f6,stroke:#6b7280,color:#111827",
		"  classDef added fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d",
		"  classDef removed fill:#fee2e2,stroke:#dc2626,stroke-width:2px,stroke-dasharray:5 5,color:#7f1d1d",
		...linkStyles,
	)
	return lines.join("\n")
}

export const renderGraphMermaid = (graph: ProjectedGraph): string =>
	renderGraphDiffMermaid({
		nodes: graph.nodes.map((node) => ({ ...node, status: "unchanged" })),
		edges: graph.edges.map((edge) => ({
			...edge,
			status: "unchanged",
			baseCount: edge.count,
			currentCount: edge.count,
		})),
	})
