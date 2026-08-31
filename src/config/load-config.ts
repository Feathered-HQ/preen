import fs from "node:fs"
import path from "node:path"
import { createJiti } from "jiti"
import { configSchema, type ProjectStructureConfig } from "./config-schema.js"

const CONFIG_EXTENSIONS = ["ts", "mts", "js", "mjs", "cjs"]

const CANDIDATE_FILES = CONFIG_EXTENSIONS.map(
	(extension) => `preen.config.${extension}`,
)

export type LoadedConfig = {
	configPath: string
	config: ProjectStructureConfig
}

export const findConfigFile = (
	cwd: string,
	explicitPath?: string,
): string => {
	if (explicitPath !== undefined) {
		const absolute = path.isAbsolute(explicitPath)
			? explicitPath
			: path.resolve(cwd, explicitPath)
		if (!fs.existsSync(absolute)) {
			throw new Error(`config file not found: ${absolute}`)
		}
		return absolute
	}
	for (const candidate of CANDIDATE_FILES) {
		const absolute = path.resolve(cwd, candidate)
		if (fs.existsSync(absolute)) return absolute
	}
	throw new Error(
		`no preen config found in ${cwd}. expected one of: ${CANDIDATE_FILES.join(", ")}`,
	)
}

export const loadConfig = async (
	cwd: string,
	explicitPath?: string,
): Promise<LoadedConfig> => {
	const configPath = findConfigFile(cwd, explicitPath)
	const jiti = createJiti(configPath, {
		fsCache: false,
		moduleCache: false,
		interopDefault: true,
	})
	const loaded = await jiti.import<unknown>(configPath, { default: true })
	const parsed = configSchema.safeParse(loaded)
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
			.join("\n")
		throw new Error(`invalid config at ${configPath}:\n${issues}`)
	}
	return { configPath, config: parsed.data }
}
