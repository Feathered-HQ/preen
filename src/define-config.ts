import type { ProjectStructureConfig } from "./config/config-schema.js"

export type UserConfig = Partial<
	Omit<ProjectStructureConfig, "include" | "ignorePatterns" | "namingRules" | "independentModules">
> & {
	include?: ProjectStructureConfig["include"]
	ignorePatterns?: ProjectStructureConfig["ignorePatterns"]
	namingRules?: ProjectStructureConfig["namingRules"]
	independentModules?: ProjectStructureConfig["independentModules"]
}

export const defineConfig = (config: UserConfig): UserConfig => config
