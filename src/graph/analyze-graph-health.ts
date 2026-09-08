import type { ProjectedGraph } from "./graph-types.js"

export type GraphHealth = {
	nodeCount: number
	edgeCount: number
	density: number
	cycles: string[][]
	highestFanIn: { id: string; count: number } | null
	highestFanOut: { id: string; count: number } | null
}

const maximum = (counts: Map<string, number>): { id: string; count: number } | null => {
	const entries = [...counts].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	)
	const first = entries[0]
	return first === undefined ? null : { id: first[0], count: first[1] }
}

const stronglyConnectedComponents = (graph: ProjectedGraph): string[][] => {
	const adjacency = new Map(graph.nodes.map((node) => [node.id, [] as string[]]))
	for (const edge of graph.edges) adjacency.get(edge.from)?.push(edge.to)
	for (const targets of adjacency.values()) targets.sort()

	let nextIndex = 0
	const indices = new Map<string, number>()
	const lowLinks = new Map<string, number>()
	const stack: string[] = []
	const onStack = new Set<string>()
	const components: string[][] = []

	const visit = (node: string): void => {
		indices.set(node, nextIndex)
		lowLinks.set(node, nextIndex)
		nextIndex += 1
		stack.push(node)
		onStack.add(node)
		for (const target of adjacency.get(node) ?? []) {
			if (!indices.has(target)) {
				visit(target)
				lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(target)!))
			} else if (onStack.has(target)) {
				lowLinks.set(node, Math.min(lowLinks.get(node)!, indices.get(target)!))
			}
		}
		if (lowLinks.get(node) !== indices.get(node)) return
		const component: string[] = []
		while (stack.length > 0) {
			const member = stack.pop()!
			onStack.delete(member)
			component.push(member)
			if (member === node) break
		}
		if (
			component.length > 1 ||
			(component.length === 1 && (adjacency.get(component[0]!) ?? []).includes(component[0]!))
		) {
			components.push(component.sort())
		}
	}

	for (const node of [...adjacency.keys()].sort()) {
		if (!indices.has(node)) visit(node)
	}
	return components.sort((a, b) => a.join("\0").localeCompare(b.join("\0")))
}

export const analyzeGraphHealth = (graph: ProjectedGraph): GraphHealth => {
	const fanIn = new Map(graph.nodes.map((node) => [node.id, 0]))
	const fanOut = new Map(graph.nodes.map((node) => [node.id, 0]))
	for (const edge of graph.edges) {
		fanOut.set(edge.from, (fanOut.get(edge.from) ?? 0) + 1)
		fanIn.set(edge.to, (fanIn.get(edge.to) ?? 0) + 1)
	}
	const possibleEdges = graph.nodes.length * Math.max(0, graph.nodes.length - 1)
	return {
		nodeCount: graph.nodes.length,
		edgeCount: graph.edges.length,
		density: possibleEdges === 0 ? 0 : graph.edges.length / possibleEdges,
		cycles: stronglyConnectedComponents(graph),
		highestFanIn: maximum(fanIn),
		highestFanOut: maximum(fanOut),
	}
}
