import path from "node:path"
import picomatch from "picomatch"

import type { ProjectStructureConfig } from "../../config/config-schema.js"
import { findWorkspaceRoot } from "../../config/find-workspace-root.js"
import { compileModulePattern } from "../../config/pattern/module-pattern.js"

export type ExplainFileResult = {
	filePath: string
	relative: string
	matchedNamingRules: { filePattern: string; rules: string[] }[]
	matchedModuleRules: {
		module: string
		allowImportsFrom: string[]
		denyImportsFrom: string[]
	}[]
	ignored: boolean
	ignoreReason?: string
}

const toPosixRelative = (cwd: string, filePath: string): string =>
	path.relative(cwd, filePath).split(path.sep).join("/")

const namingRuleSummary = (rule: {
	requireFilenameMatchesExport?: boolean
	requireSingleExport?: boolean
	allowOnly?: readonly string[]
}): string[] => {
	const out: string[] = []
	if (rule.requireSingleExport === true) out.push("requireSingleExport")
	if (rule.requireFilenameMatchesExport === true)
		out.push("requireFilenameMatchesExport")
	if (rule.allowOnly !== undefined && rule.allowOnly.length > 0)
		out.push(`allowOnly: ${rule.allowOnly.join(", ")}`)
	return out
}

export const explainFile = (
	cwd: string,
	config: ProjectStructureConfig,
	filePath: string,
): ExplainFileResult => {
	const absolutePath = path.isAbsolute(filePath)
		? filePath.split(path.sep).join("/")
		: path.resolve(cwd, filePath).split(path.sep).join("/")
	const relative = toPosixRelative(cwd, absolutePath)

	const ignoreMatchers = config.ignorePatterns.map((pattern) => ({
		pattern,
		matcher: picomatch(pattern, { dot: true }),
	}))
	const ignoreHit = ignoreMatchers.find(({ matcher }) => matcher(relative))

	if (ignoreHit !== undefined) {
		return {
			filePath: absolutePath,
			relative,
			matchedNamingRules: [],
			matchedModuleRules: [],
			ignored: true,
			ignoreReason: ignoreHit.pattern,
		}
	}

	const matchedNamingRules = config.namingRules
		.filter((rule) => picomatch(rule.filePattern, { dot: true })(relative))
		.map((rule) => ({
			filePattern: rule.filePattern,
			rules: namingRuleSummary(rule),
		}))

	// Module pattern matching is workspace-relative — mirror the checker's
	// own resolution so explain reports what the actual run would see.
	const workspaceRoot =
		config.workspaceRoot !== undefined
			? path.resolve(cwd, config.workspaceRoot)
			: (findWorkspaceRoot(cwd) ?? cwd)
	const workspaceRelative = toPosixRelative(workspaceRoot, absolutePath)

	const matchedModuleRules = config.independentModules
		.map((rule) => ({
			rule,
			match: compileModulePattern(rule.module).matcher(workspaceRelative),
		}))
		.filter(({ match }) => match !== null)
		.map(({ rule }) => ({
			module: rule.module,
			allowImportsFrom: rule.allowImportsFrom,
			denyImportsFrom: rule.denyImportsFrom ?? [],
		}))

	return {
		filePath: absolutePath,
		relative,
		matchedNamingRules,
		matchedModuleRules,
		ignored: false,
	}
}

export const formatExplainResult = (
	result: ExplainFileResult,
	useColor: boolean,
): string => {
	const dim = useColor ? (s: string) => `\x1b[2m${s}\x1b[22m` : (s: string) => s
	const bold = useColor ? (s: string) => `\x1b[1m${s}\x1b[22m` : (s: string) => s

	const lines: string[] = []
	lines.push(bold(`File: ${result.relative}`))

	if (result.ignored) {
		lines.push(`  ${dim("ignored")} — matches ${result.ignoreReason}`)
		return lines.join("\n")
	}

	if (result.matchedNamingRules.length === 0) {
		lines.push(`  ${dim("no naming rules match")}`)
	} else {
		lines.push("")
		lines.push(bold("Naming rules:"))
		for (const matched of result.matchedNamingRules) {
			lines.push(`  pattern: ${matched.filePattern}`)
			for (const rule of matched.rules) {
				lines.push(`    • ${rule}`)
			}
		}
	}

	if (result.matchedModuleRules.length === 0) {
		lines.push("")
		lines.push(`  ${dim("no import rules match")}`)
	} else {
		lines.push("")
		lines.push(bold("Import rules:"))
		for (const matched of result.matchedModuleRules) {
			lines.push(`  module: ${matched.module}`)
			lines.push(`    allowImportsFrom:`)
			for (const item of matched.allowImportsFrom) {
				lines.push(`      ✓ ${item}`)
			}
			if (matched.denyImportsFrom.length > 0) {
				lines.push(`    denyImportsFrom:`)
				for (const item of matched.denyImportsFrom) {
					lines.push(`      ✗ ${item}`)
				}
			}
		}
	}

	return lines.join("\n")
}
