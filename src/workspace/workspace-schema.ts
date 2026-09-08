import { z } from "zod"

export const workspaceConfigSchema = z.object({
	projects: z.array(z.string().min(1)).min(1),
	graph: z
		.object({
			snapshot: z.string().min(1).default(".preen/dependency-graph.snapshot.json"),
		})
		.default({ snapshot: ".preen/dependency-graph.snapshot.json" }),
})

export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>

export type UserWorkspaceConfig = {
	projects: string[]
	graph?: { snapshot?: string }
}

export const defineWorkspace = (
	config: UserWorkspaceConfig,
): UserWorkspaceConfig => config
