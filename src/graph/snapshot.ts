import { z } from "zod"
import {
	DEPENDENCY_GRAPH_SCHEMA_VERSION,
	type DependencyGraph,
} from "./graph-types.js"
import { normalizeGraph } from "./normalize-graph.js"

const snapshotSchema = z.object({
	schemaVersion: z.literal(DEPENDENCY_GRAPH_SCHEMA_VERSION),
	slices: z.array(z.object({ id: z.string(), root: z.string() })),
	files: z.array(z.object({ id: z.string(), slice: z.string() })),
	edges: z.array(
		z.object({
			from: z.string(),
			to: z.string(),
			kind: z.enum(["runtime", "type"]),
		}),
	),
	unresolvedImports: z.array(
		z.object({ from: z.string(), specifier: z.string() }),
	),
})

export const serializeSnapshot = (graph: DependencyGraph): string =>
	`${JSON.stringify(normalizeGraph(graph), null, 2)}\n`

export const parseSnapshot = (source: string): DependencyGraph => {
	let value: unknown
	try {
		value = JSON.parse(source)
	} catch (error) {
		throw new Error(`invalid dependency graph snapshot: ${(error as Error).message}`)
	}
	if (
		typeof value === "object" &&
		value !== null &&
		"schemaVersion" in value &&
		(value as { schemaVersion?: unknown }).schemaVersion !==
			DEPENDENCY_GRAPH_SCHEMA_VERSION
	) {
		throw new Error(
			`unsupported dependency graph schema version: ${String((value as { schemaVersion?: unknown }).schemaVersion)}`,
		)
	}
	const parsed = snapshotSchema.safeParse(value)
	if (!parsed.success) {
		throw new Error(
			`invalid dependency graph snapshot: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
		)
	}
	return normalizeGraph(parsed.data)
}
