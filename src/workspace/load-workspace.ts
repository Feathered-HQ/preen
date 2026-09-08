import fs from "node:fs"
import path from "node:path"
import { createJiti } from "jiti"
import { glob } from "tinyglobby"
import { loadConfig } from "../config/load-config.js"
import type { ProjectStructureConfig } from "../config/config-schema.js"
import type { GraphSlice } from "../graph/graph-types.js"
import { workspaceConfigSchema } from "./workspace-schema.js"

const WORKSPACE_FILES = [
	"preen.workspace.ts",
	"preen.workspace.mts",
	"preen.workspace.js",
	"preen.workspace.mjs",
	"preen.workspace.cjs",
]

export type LoadedWorkspaceProject = {
	cwd: string
	configPath: string
	config: ProjectStructureConfig
	slice: GraphSlice
}

export type LoadedWorkspace = {
	root: string
	configPath: string
	snapshotPath: string
	projects: LoadedWorkspaceProject[]
}

const findWorkspaceConfig = (cwd: string): string => {
	for (const name of WORKSPACE_FILES) {
		const candidate = path.resolve(cwd, name)
		if (fs.existsSync(candidate)) return candidate
	}
	throw new Error(
		`no preen workspace config found in ${cwd}. expected one of: ${WORKSPACE_FILES.join(", ")}`,
	)
}

export const loadWorkspace = async (cwd: string): Promise<LoadedWorkspace> => {
	const root = path.resolve(cwd)
	const configPath = findWorkspaceConfig(root)
	const jiti = createJiti(configPath, {
		fsCache: false,
		moduleCache: false,
		interopDefault: true,
	})
	const source = await jiti.import<unknown>(configPath, { default: true })
	const parsed = workspaceConfigSchema.safeParse(source)
	if (!parsed.success) {
		throw new Error(
			`invalid workspace config at ${configPath}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
		)
	}
	const configFiles = await glob(parsed.data.projects, {
		cwd: root,
		absolute: true,
		onlyFiles: true,
	})
	configFiles.sort((a, b) => a.localeCompare(b))
	if (configFiles.length === 0) {
		throw new Error("workspace project patterns matched no preen config files")
	}

	const projects: LoadedWorkspaceProject[] = []
	const sliceIds = new Set<string>()
	for (const projectConfigPath of configFiles) {
		const projectCwd = path.dirname(projectConfigPath)
		const loaded = await loadConfig(projectCwd, projectConfigPath)
		const relativeRoot = path.relative(root, projectCwd).split(path.sep).join("/") || "."
		const sliceId = loaded.config.graph?.sliceId ?? path.basename(projectCwd)
		if (sliceIds.has(sliceId)) {
			throw new Error(`duplicate graph slice id: ${sliceId}`)
		}
		sliceIds.add(sliceId)
		projects.push({
			cwd: projectCwd,
			configPath: projectConfigPath,
			config: loaded.config,
			slice: { id: sliceId, root: relativeRoot },
		})
	}

	return {
		root,
		configPath,
		snapshotPath: parsed.data.graph.snapshot,
		projects,
	}
}
