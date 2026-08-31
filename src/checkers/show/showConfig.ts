import path from "node:path"
import kleur from "kleur"

import type {
	FolderEntry,
	FolderRule,
	NameSpec,
	NamingRule,
	ProjectStructureConfig,
} from "../../config/config-schema.js"
import { findWorkspaceRoot } from "../../config/find-workspace-root.js"

export type ShowConfigInput = {
	cwd: string
	configPath: string
	config: ProjectStructureConfig
}

const MAX_RULE_EXPANSION_DEPTH = 6

const SECTION = (title: string, useColor: boolean): string =>
	useColor ? kleur.bold().cyan(title) : title

const DIM = (text: string, useColor: boolean): string =>
	useColor ? kleur.dim(text) : text

const GREEN = (text: string, useColor: boolean): string =>
	useColor ? kleur.green(text) : text

const RED = (text: string, useColor: boolean): string =>
	useColor ? kleur.red(text) : text

const YELLOW = (text: string, useColor: boolean): string =>
	useColor ? kleur.yellow(text) : text

const BLUE = (text: string, useColor: boolean): string =>
	useColor ? kleur.blue(text) : text

const BOLD = (text: string, useColor: boolean): string =>
	useColor ? kleur.bold(text) : text

const toPosix = (filePath: string): string => filePath.split(path.sep).join("/")

const renderNameSpec = (
	spec: NameSpec | undefined,
	useColor: boolean,
): string => {
	if (spec === undefined) return DIM("(no name)", useColor)
	if (typeof spec === "string") return BLUE(spec, useColor)
	if ("case" in spec) return DIM("name with case:", useColor) + " " + YELLOW(spec.case, useColor)
	return DIM("name matching /", useColor) + YELLOW(spec.regex, useColor) + DIM("/", useColor)
}

const renderFolderEntry = (
	entry: FolderEntry,
	rules: Record<string, FolderRule> | undefined,
	prefix: string,
	isLast: boolean,
	useColor: boolean,
	depth: number,
	seenRuleIds: Set<string>,
): string[] => {
	const branch = isLast ? "└─ " : "├─ "
	const nextPrefix = prefix + (isLast ? "   " : "│  ")

	const nameLabel = renderNameSpec(entry.name, useColor)
	const tags: string[] = []
	if (entry.optional === true) tags.push(DIM("(optional)", useColor))
	if (entry.disallow === true) tags.push(RED("(disallow)", useColor))
	if (entry.ruleId !== undefined)
		tags.push(DIM("via rule ", useColor) + YELLOW(entry.ruleId, useColor))

	const headline = `${prefix}${branch}${nameLabel}${tags.length > 0 ? " " + tags.join(" ") : ""}`
	const lines: string[] = [headline]

	// Inline-expand the children of a referenced rule, but guard against
	// runaway / cyclic expansion.
	const inlinedChildren =
		entry.children !== undefined
			? entry.children
			: entry.ruleId !== undefined && rules?.[entry.ruleId]?.children !== undefined
				? rules[entry.ruleId]?.children
				: undefined

	if (
		entry.ruleId !== undefined &&
		seenRuleIds.has(entry.ruleId) === false &&
		depth < MAX_RULE_EXPANSION_DEPTH &&
		inlinedChildren !== undefined &&
		inlinedChildren.length > 0
	) {
		const nextSeen = new Set(seenRuleIds)
		nextSeen.add(entry.ruleId)
		for (let i = 0; i < inlinedChildren.length; i += 1) {
			const child = inlinedChildren[i]
			if (child === undefined) continue
			lines.push(
				...renderFolderEntry(
					child,
					rules,
					nextPrefix,
					i === inlinedChildren.length - 1,
					useColor,
					depth + 1,
					nextSeen,
				),
			)
		}
	} else if (entry.children !== undefined && entry.children.length > 0) {
		for (let i = 0; i < entry.children.length; i += 1) {
			const child = entry.children[i]
			if (child === undefined) continue
			lines.push(
				...renderFolderEntry(
					child,
					rules,
					nextPrefix,
					i === entry.children.length - 1,
					useColor,
					depth + 1,
					seenRuleIds,
				),
			)
		}
	}

	return lines
}

const renderFolderStructure = (
	config: ProjectStructureConfig,
	useColor: boolean,
): string[] => {
	const fs = config.folderStructure
	if (fs === undefined) {
		return [DIM("  (no folderStructure configured)", useColor)]
	}
	const lines: string[] = [
		`  root: ${BLUE(fs.root, useColor)}` +
			(fs.allowExtraTopLevelEntries === false
				? "  " + RED("(no extra top-level entries)", useColor)
				: ""),
		"",
	]
	if (fs.structure.length === 0) {
		lines.push(DIM("  (empty structure)", useColor))
	} else {
		for (let i = 0; i < fs.structure.length; i += 1) {
			const entry = fs.structure[i]
			if (entry === undefined) continue
			lines.push(
				...renderFolderEntry(
					entry,
					fs.rules,
					"  ",
					i === fs.structure.length - 1,
					useColor,
					0,
					new Set(),
				),
			)
		}
	}

	const ruleIdsUsed = collectUsedRuleIds(fs.structure)
	const definedRuleIds = Object.keys(fs.rules ?? {})
	const unusedRuleIds = definedRuleIds.filter(
		(id) => ruleIdsUsed.has(id) === false,
	)
	if (unusedRuleIds.length > 0) {
		lines.push("")
		lines.push(
			DIM(`  unused folder rules: ${unusedRuleIds.join(", ")}`, useColor),
		)
	}

	return lines
}

const collectUsedRuleIds = (entries: FolderEntry[]): Set<string> => {
	const out = new Set<string>()
	const walk = (entry: FolderEntry): void => {
		if (entry.ruleId !== undefined) out.add(entry.ruleId)
		for (const child of entry.children ?? []) walk(child)
	}
	for (const entry of entries) walk(entry)
	return out
}

const renderNamingRule = (
	rule: NamingRule,
	useColor: boolean,
): string[] => {
	const lines: string[] = [`  ${BLUE(rule.filePattern, useColor)}`]
	if (rule.allowOnly !== undefined) {
		lines.push(
			`    • allowOnly: ${rule.allowOnly.map((k) => YELLOW(k, useColor)).join(", ")}`,
		)
	}
	if (rule.requireFilenameMatchesExport === true) {
		lines.push(`    • requireFilenameMatchesExport`)
	}
	if (rule.requireSingleExport === true) {
		lines.push(`    • requireSingleExport`)
	}
	if (rule.forbidDefaultExport === true) {
		lines.push(`    • forbidDefaultExport`)
	}
	const kindKeys = [
		"variable",
		"function",
		"class",
		"type",
		"interface",
		"enum",
	] as const
	for (const kind of kindKeys) {
		const target = rule[kind]
		if (target === undefined) continue
		const parts: string[] = []
		if (target.case !== undefined) parts.push(`case: ${YELLOW(target.case, useColor)}`)
		if (target.regex !== undefined) parts.push(`regex: /${target.regex}/`)
		if (target.prefix !== undefined) parts.push(`prefix: "${target.prefix}"`)
		if (target.suffix !== undefined) parts.push(`suffix: "${target.suffix}"`)
		lines.push(`    • ${kind} → ${parts.join(", ")}`)
	}
	return lines
}

const renderIndependentModule = (
	rule: ProjectStructureConfig["independentModules"][number],
	useColor: boolean,
): string[] => {
	const lines: string[] = [`  ${BOLD(rule.module, useColor)}`]
	for (const pattern of rule.allowImportsFrom) {
		lines.push(`    ${GREEN("✓ allow", useColor)} ${pattern}`)
	}
	for (const pattern of rule.denyImportsFrom ?? []) {
		lines.push(`    ${RED("✗ deny", useColor)}  ${pattern}`)
	}
	lines.push(
		`    ${DIM("(everything else is denied — implicit)", useColor)}`,
	)
	return lines
}

export const formatShowConfig = (
	input: ShowConfigInput,
	useColor: boolean,
): string => {
	const { cwd, configPath, config } = input
	const lines: string[] = []

	const resolvedWorkspaceRoot =
		config.workspaceRoot !== undefined
			? path.resolve(cwd, config.workspaceRoot)
			: findWorkspaceRoot(cwd)
	const workspaceRootDisplay =
		resolvedWorkspaceRoot !== null
			? `${toPosix(resolvedWorkspaceRoot)}${config.workspaceRoot !== undefined ? "" : " " + DIM("(auto-detected)", useColor)}`
			: DIM("(not detected; using cwd)", useColor)

	lines.push(SECTION("preen config", useColor))
	lines.push(`  configPath:     ${BLUE(toPosix(path.relative(cwd, configPath) || configPath), useColor)}`)
	lines.push(`  cwd:            ${toPosix(cwd)}`)
	lines.push(`  workspaceRoot:  ${workspaceRootDisplay}`)
	if (config.tsconfig !== undefined) {
		lines.push(`  tsconfig:       ${BLUE(config.tsconfig, useColor)}`)
	} else {
		lines.push(`  tsconfig:       ${DIM("(auto-detected)", useColor)}`)
	}
	lines.push("")

	lines.push(SECTION("Scope", useColor))
	lines.push(`  include (${config.include.length}):`)
	for (const pattern of config.include) {
		lines.push(`    • ${BLUE(pattern, useColor)}`)
	}
	if (config.ignorePatterns.length > 0) {
		lines.push(`  ignore (${config.ignorePatterns.length}):`)
		for (const pattern of config.ignorePatterns) {
			lines.push(`    • ${DIM(pattern, useColor)}`)
		}
	} else {
		lines.push(`  ignore: ${DIM("(none)", useColor)}`)
	}
	lines.push("")

	lines.push(SECTION("Folder structure", useColor))
	lines.push(...renderFolderStructure(config, useColor))
	lines.push("")

	lines.push(
		SECTION(`Naming rules (${config.namingRules.length})`, useColor),
	)
	if (config.namingRules.length === 0) {
		lines.push(`  ${DIM("(none)", useColor)}`)
	} else {
		for (let i = 0; i < config.namingRules.length; i += 1) {
			const rule = config.namingRules[i]
			if (rule === undefined) continue
			lines.push(...renderNamingRule(rule, useColor))
			if (i < config.namingRules.length - 1) lines.push("")
		}
	}
	lines.push("")

	lines.push(
		SECTION(
			`Independent modules (${config.independentModules.length})`,
			useColor,
		),
	)
	if (config.independentModules.length === 0) {
		lines.push(`  ${DIM("(none — import boundaries are not enforced)", useColor)}`)
	} else {
		for (let i = 0; i < config.independentModules.length; i += 1) {
			const rule = config.independentModules[i]
			if (rule === undefined) continue
			lines.push(...renderIndependentModule(rule, useColor))
			if (i < config.independentModules.length - 1) lines.push("")
		}
	}
	lines.push("")

	const banned = config.bannedPatterns
	lines.push(SECTION(`Banned patterns (${banned.length})`, useColor))
	if (banned.length === 0) {
		lines.push(`  ${DIM("(none)", useColor)}`)
	} else {
		const rows = banned.map((entry) => {
			const pattern = typeof entry === "string" ? entry : entry.pattern
			const reason = typeof entry === "string" ? undefined : entry.reason
			return { pattern, reason }
		})
		const widest = rows.reduce(
			(acc, row) => Math.max(acc, row.pattern.length),
			0,
		)
		for (const row of rows) {
			const padded = row.pattern.padEnd(widest, " ")
			const reasonText =
				row.reason !== undefined ? DIM(" — " + row.reason, useColor) : ""
			lines.push(`  ${RED("✗", useColor)} ${BLUE(padded, useColor)}${reasonText}`)
		}
	}
	lines.push("")

	lines.push(SECTION("Extra flags", useColor))
	const onOff = (flag: boolean): string =>
		flag === true ? GREEN("on", useColor) : DIM("off", useColor)
	lines.push(
		`  forbidRelativeParentImports:  ${onOff(config.forbidRelativeParentImports)}`,
	)
	lines.push(
		`  requireTestPairing:           ${onOff(config.requireTestPairing)}`,
	)

	return lines.join("\n")
}
