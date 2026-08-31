import type {
	FolderEntry,
	ProjectStructureConfig,
} from "../../config/config-schema.js"

export type ConfigValidationIssue = {
	severity: "error" | "warning"
	message: string
	location?: string
}

const collectRuleIdReferences = (
	entries: FolderEntry[],
	references: Set<string>,
): void => {
	for (const entry of entries) {
		if (entry.ruleId !== undefined) references.add(entry.ruleId)
		if (entry.children !== undefined)
			collectRuleIdReferences(entry.children, references)
	}
}

export const validateConfig = (
	config: ProjectStructureConfig,
): ConfigValidationIssue[] => {
	const issues: ConfigValidationIssue[] = []

	if (config.folderStructure !== undefined) {
		const declaredRuleIds = new Set(
			Object.keys(config.folderStructure.rules ?? {}),
		)
		const referencedRuleIds = new Set<string>()
		collectRuleIdReferences(config.folderStructure.structure, referencedRuleIds)
		for (const childRules of Object.values(
			config.folderStructure.rules ?? {},
		)) {
			collectRuleIdReferences(childRules.children ?? [], referencedRuleIds)
		}

		for (const referenced of referencedRuleIds) {
			if (!declaredRuleIds.has(referenced)) {
				issues.push({
					severity: "error",
					message: `folderStructure references undefined ruleId "${referenced}"`,
				})
			}
		}
		for (const declared of declaredRuleIds) {
			if (!referencedRuleIds.has(declared)) {
				issues.push({
					severity: "warning",
					message: `folderStructure.rules.${declared} is declared but never referenced`,
				})
			}
		}
	}

	if (config.independentModules.length === 0) {
		issues.push({
			severity: "warning",
			message:
				"no independentModules rules — files inside this package can import anything",
		})
	}
	const seenModulePatterns = new Set<string>()
	for (const rule of config.independentModules) {
		if (seenModulePatterns.has(rule.module)) {
			issues.push({
				severity: "warning",
				message: `independentModules has duplicate module pattern "${rule.module}"`,
			})
		}
		seenModulePatterns.add(rule.module)
		if (rule.allowImportsFrom.length === 0) {
			issues.push({
				severity: "error",
				message: `independentModules rule for "${rule.module}" has empty allowImportsFrom — nothing will be importable`,
			})
		}
	}

	for (const rule of config.namingRules) {
		const hasAnyConstraint =
			rule.requireFilenameMatchesExport === true ||
			rule.requireSingleExport === true ||
			rule.forbidDefaultExport === true ||
			rule.allowOnly !== undefined ||
			rule.variable !== undefined ||
			rule.function !== undefined ||
			rule.class !== undefined ||
			rule.type !== undefined ||
			rule.interface !== undefined ||
			rule.enum !== undefined
		if (!hasAnyConstraint) {
			issues.push({
				severity: "warning",
				message: `namingRule for "${rule.filePattern}" declares no constraints — does nothing`,
			})
		}
	}

	for (const pattern of config.bannedPatterns) {
		const value = typeof pattern === "string" ? pattern : pattern.pattern
		if (value === undefined || value.length === 0) {
			issues.push({
				severity: "error",
				message: "bannedPatterns has an empty pattern",
			})
		}
	}

	return issues
}

export const formatValidationIssues = (
	issues: ConfigValidationIssue[],
	useColor: boolean,
): string => {
	if (issues.length === 0) return "config: no consistency issues"

	const red = useColor ? (s: string) => `\x1b[31m${s}\x1b[39m` : (s: string) => s
	const yellow = useColor
		? (s: string) => `\x1b[33m${s}\x1b[39m`
		: (s: string) => s

	const lines: string[] = []
	for (const issue of issues) {
		const tag = issue.severity === "error" ? red("error") : yellow("warning")
		lines.push(`${tag}: ${issue.message}`)
	}
	const errors = issues.filter((i) => i.severity === "error").length
	const warnings = issues.length - errors
	lines.push("")
	lines.push(`config: ${errors} error(s), ${warnings} warning(s)`)
	return lines.join("\n")
}
