export const DEPENDENCY_GRAPH_SCHEMA_VERSION = 1 as const

export type DependencyKind = "runtime" | "type"

export type GraphSlice = {
	id: string
	root: string
}

export type GraphFile = {
	id: string
	slice: string
}

export type GraphEdge = {
	from: string
	to: string
	kind: DependencyKind
}

export type UnresolvedImport = {
	from: string
	specifier: string
}

export type DependencyGraph = {
	schemaVersion: typeof DEPENDENCY_GRAPH_SCHEMA_VERSION
	slices: GraphSlice[]
	files: GraphFile[]
	edges: GraphEdge[]
	unresolvedImports: UnresolvedImport[]
}

export type GraphStatus = "added" | "removed" | "unchanged"

export type GraphDiff = {
	nodes: Array<GraphFile & { status: GraphStatus }>
	edges: Array<GraphEdge & { status: GraphStatus }>
}

export type ProjectedNode = {
	id: string
	kind: "file" | "slice" | "boundary"
	slice?: string
}

export type ProjectedEdge = GraphEdge & {
	count: number
}

export type ProjectedGraph = {
	nodes: ProjectedNode[]
	edges: ProjectedEdge[]
}

export type ProjectedGraphDiff = {
	nodes: Array<ProjectedNode & { status: GraphStatus }>
	edges: Array<
		GraphEdge & {
			status: GraphStatus
			baseCount: number
			currentCount: number
		}
	>
}

export type GraphProjectionOptions = {
	scope:
		| { type: "all" }
		| { type: "slice"; id: string }
		| { type: "path"; path: string }
	granularity: "file" | "slice"
	afterDepth?: number | "all"
	behindDepth?: number | "all"
}
