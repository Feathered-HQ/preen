export { diffGraphs, diffProjectedGraphs } from "./diff-graphs.js"
export { buildDependencyGraph } from "./build-dependency-graph.js"
export { analyzeGraphHealth } from "./analyze-graph-health.js"
export type { GraphHealth } from "./analyze-graph-health.js"
export { normalizeGraph } from "./normalize-graph.js"
export { projectGraph } from "./project-graph.js"
export { renderGraphDiffMermaid, renderGraphMermaid } from "./render-mermaid.js"
export { parseSnapshot, serializeSnapshot } from "./snapshot.js"
export type {
	DependencyGraph,
	DependencyKind,
	GraphDiff,
	GraphEdge,
	GraphFile,
	GraphProjectionOptions,
	GraphSlice,
	GraphStatus,
	ProjectedEdge,
	ProjectedGraph,
	ProjectedGraphDiff,
	ProjectedNode,
	UnresolvedImport,
} from "./graph-types.js"
