import path from "node:path"
import { findWorkspaceRoot } from "../../config/find-workspace-root.js"
import type { IndependentModuleRule } from "../../config/config-schema.js"
import {
	compileModulePattern,
	expandAllowPattern,
	matchAllowPattern,
	type ModuleMatch,
} from "../../config/pattern/module-pattern.js"
import type { Diagnostic } from "../../diagnostics/diagnostic.js"
import { errorDiagnostic } from "../../diagnostics/diagnostic.js"
import { extractImports } from "./extract-imports.js"
import {
	createResolver,
	type ImportResolver,
} from "./create-resolver.js"
import {
	offsetToLocation,
	parseSourceFile,
} from "../naming-rules/parse-source-file.js"

type CompiledRule = {
	source: IndependentModuleRule
	matcher: ReturnType<typeof compileModulePattern>
}

export type CheckIndependentModulesOptions = {
	cwd: string
	files: string[]
	rules: IndependentModuleRule[]
	tsconfig?: string
	workspaceRoot?: string
}

const toPosixRelative = (from: string, absolute: string): string =>
	path.relative(from, absolute).split(path.sep).join("/")

const isWithinNodeModules = (filePath: string): boolean =>
	filePath.includes("/node_modules/") || filePath.startsWith("node_modules/")

const nodeModulesRelative = (absolutePath: string): string => {
	const parts = absolutePath.split("/node_modules/")
	const tail = parts[parts.length - 1] ?? absolutePath
	return `node_modules/${tail}`
}

export const checkIndependentModules = (
	options: CheckIndependentModulesOptions,
): Diagnostic[] => {
	const diagnostics: Diagnostic[] = []
	if (options.rules.length === 0) return diagnostics

	const workspaceRoot =
		options.workspaceRoot !== undefined
			? path.resolve(options.cwd, options.workspaceRoot)
			: (findWorkspaceRoot(options.cwd) ?? options.cwd)

	const compiledRules: CompiledRule[] = options.rules.map((rule) => ({
		source: rule,
		matcher: compileModulePattern(rule.module),
	}))

	const resolver: ImportResolver = createResolver({
		cwd: options.cwd,
		tsconfig: options.tsconfig,
	})

	for (const filePath of options.files) {
		const workspaceRelative = toPosixRelative(workspaceRoot, filePath)
		const matches: { rule: CompiledRule; module: ModuleMatch }[] = []
		for (const compiled of compiledRules) {
			const moduleMatch = compiled.matcher.matcher(workspaceRelative)
			if (moduleMatch === null) continue
			matches.push({ rule: compiled, module: moduleMatch })
		}
		if (matches.length === 0) continue

		let parsed: ReturnType<typeof parseSourceFile>
		try {
			parsed = parseSourceFile(filePath)
		} catch (error) {
			diagnostics.push(
				errorDiagnostic({
					ruleId: "config/parse-error",
					message: `failed to parse: ${(error as Error).message}`,
					filePath,
				}),
			)
			continue
		}
		const imports = extractImports(parsed.program)

		for (const importSite of imports) {
			const resolved = resolver.resolve(filePath, importSite.source)
			if ("external" in resolved) continue
			if ("error" in resolved) {
				if (importSite.source.startsWith(".") || importSite.source.startsWith("/")) {
					const start = offsetToLocation(parsed.sourceText, importSite.start)
					const end = offsetToLocation(parsed.sourceText, importSite.end)
					diagnostics.push(
						errorDiagnostic({
							ruleId: "independent-modules/unresolvable-import",
							message: `cannot resolve "${importSite.source}": ${resolved.error}`,
							filePath,
							range: { start, end },
						}),
					)
				}
				continue
			}
			const resolvedPosix = resolved.resolved.split(path.sep).join("/")
			const resolvedRelative = isWithinNodeModules(resolvedPosix)
				? nodeModulesRelative(resolvedPosix)
				: toPosixRelative(workspaceRoot, resolved.resolved)

			for (const { rule, module } of matches) {
				const denyPatterns = rule.source.denyImportsFrom ?? []
				const explicitlyDenied = denyPatterns.some((pattern) => {
					const expanded = expandAllowPattern(pattern, { selfModule: module })
					return matchAllowPattern(resolvedRelative, expanded)
				})
				if (explicitlyDenied) {
					const start = offsetToLocation(parsed.sourceText, importSite.start)
					const end = offsetToLocation(parsed.sourceText, importSite.end)
					diagnostics.push(
						errorDiagnostic({
							ruleId: "independent-modules/import-explicitly-denied",
							message: `import of "${importSite.source}" (resolved to ${resolvedRelative}) is explicitly denied for module "${rule.source.module}"`,
							filePath,
							range: { start, end },
						}),
					)
					continue
				}
				const allowed = rule.source.allowImportsFrom.some((pattern) => {
					const expanded = expandAllowPattern(pattern, { selfModule: module })
					return matchAllowPattern(resolvedRelative, expanded)
				})
				if (!allowed) {
					const start = offsetToLocation(parsed.sourceText, importSite.start)
					const end = offsetToLocation(parsed.sourceText, importSite.end)
					diagnostics.push(
						errorDiagnostic({
							ruleId: "independent-modules/import-not-allowed",
							message: `import of "${importSite.source}" (resolved to ${resolvedRelative}) is not in the allowlist for module "${rule.source.module}"`,
							filePath,
							range: { start, end },
						}),
					)
				}
			}
		}
	}

	return diagnostics
}
