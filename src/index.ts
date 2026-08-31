export { defineConfig } from "./define-config.js"
export type { UserConfig } from "./define-config.js"
export { runChecks } from "./run-checks.js"
export type { RunChecksOptions, RunChecksResult } from "./run-checks.js"
export { loadConfig } from "./config/load-config.js"
export { runCli } from "./cli.js"
export type {
	Diagnostic,
	DiagnosticSeverity,
	DiagnosticRange,
} from "./diagnostics/diagnostic.js"
export type {
	ProjectStructureConfig,
	NamingRule,
	IndependentModuleRule,
	FolderStructureConfig,
} from "./config/config-schema.js"

export { fileNamePattern } from "./dsl/fileNamePattern.js"
export type { FileNamePattern } from "./dsl/fileNamePattern.js"

export { vsaPackage } from "./presets/vsaPackage.js"
export type { VsaPackageOptions } from "./presets/vsaPackage.js"

export { explainFile, formatExplainResult } from "./checkers/explain/explainFile.js"
export type { ExplainFileResult } from "./checkers/explain/explainFile.js"
export {
	validateConfig,
	formatValidationIssues,
} from "./checkers/validate/validateConfig.js"
export type { ConfigValidationIssue } from "./checkers/validate/validateConfig.js"
export { formatShowConfig } from "./checkers/show/showConfig.js"
export type { ShowConfigInput } from "./checkers/show/showConfig.js"
