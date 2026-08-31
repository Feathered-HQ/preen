import path from "node:path"
import picomatch from "picomatch"
import { matchesCase } from "../../config/case-style.js"
import type {
	NamingKind,
	NamingRule,
	NamingTarget,
} from "../../config/config-schema.js"
import type { Diagnostic } from "../../diagnostics/diagnostic.js"
import { errorDiagnostic } from "../../diagnostics/diagnostic.js"
import {
	extractTopLevelDeclarations,
	hasDefaultExport,
} from "./extract-top-level-declarations.js"
import { offsetToLocation, parseSourceFile } from "./parse-source-file.js"

const NAMING_KINDS: readonly NamingKind[] = [
	"variable",
	"function",
	"class",
	"type",
	"interface",
	"enum",
] as const

const targetForKind = (
	rule: NamingRule,
	kind: NamingKind,
): NamingTarget | undefined => {
	switch (kind) {
		case "variable":
			return rule.variable
		case "function":
			return rule.function
		case "class":
			return rule.class
		case "type":
			return rule.type
		case "interface":
			return rule.interface
		case "enum":
			return rule.enum
		default:
			return undefined
	}
}

const filenameStem = (filePath: string): string => {
	const base = path.basename(filePath)
	const dotIndex = base.indexOf(".")
	return dotIndex === -1 ? base : base.slice(0, dotIndex)
}

const checkTargetMatches = (
	name: string,
	target: NamingTarget,
): { ok: true } | { ok: false; reason: keyof Diagnostic["ruleId"] | string; description: string } => {
	if (target.case !== undefined) {
		if (!matchesCase(name, target.case)) {
			return {
				ok: false,
				reason: "case",
				description: `name "${name}" does not match case ${target.case}`,
			}
		}
	}
	if (target.regex !== undefined) {
		const matcher = new RegExp(target.regex)
		if (!matcher.test(name)) {
			return {
				ok: false,
				reason: "regex",
				description: `name "${name}" does not match regex ${target.regex}`,
			}
		}
	}
	if (target.prefix !== undefined && !name.startsWith(target.prefix)) {
		return {
			ok: false,
			reason: "prefix",
			description: `name "${name}" must start with prefix "${target.prefix}"`,
		}
	}
	if (target.suffix !== undefined && !name.endsWith(target.suffix)) {
		return {
			ok: false,
			reason: "suffix",
			description: `name "${name}" must end with suffix "${target.suffix}"`,
		}
	}
	return { ok: true }
}

export type CheckNamingRulesOptions = {
	cwd: string
	files: string[]
	rules: NamingRule[]
}

export const checkNamingRules = (
	options: CheckNamingRulesOptions,
): Diagnostic[] => {
	const diagnostics: Diagnostic[] = []
	if (options.rules.length === 0) return diagnostics

	const compiledRules = options.rules.map((rule) => ({
		rule,
		matcher: picomatch(rule.filePattern, { dot: true }),
	}))

	for (const filePath of options.files) {
		const relative = path.relative(options.cwd, filePath).split(path.sep).join("/")
		const matchingRules = compiledRules
			.filter(({ matcher }) => matcher(relative))
			.map(({ rule }) => rule)
		if (matchingRules.length === 0) continue

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
		const declarations = extractTopLevelDeclarations(parsed.program)

		for (const rule of matchingRules) {
			if (rule.allowOnly !== undefined) {
				const allowed = new Set<NamingKind>(rule.allowOnly)
				for (const declaration of declarations) {
					if (!declaration.exported) continue
					if (!allowed.has(declaration.kind)) {
						const startLocation = offsetToLocation(parsed.sourceText, declaration.start)
						const endLocation = offsetToLocation(parsed.sourceText, declaration.end)
						diagnostics.push(
							errorDiagnostic({
								ruleId: "naming-rules/disallowed-export-kind",
								message: `${declaration.kind} export "${declaration.name}" is not allowed in files matching "${rule.filePattern}" (allowOnly: ${rule.allowOnly.join(", ")})`,
								filePath,
								range: { start: startLocation, end: endLocation },
							}),
						)
					}
				}
			}

			for (const kind of NAMING_KINDS) {
				const target = targetForKind(rule, kind)
				if (target === undefined) continue
				const matchingDeclarations = declarations.filter(
					(declaration) => declaration.kind === kind,
				)
				for (const declaration of matchingDeclarations) {
					const checkResult = checkTargetMatches(declaration.name, target)
					if (checkResult.ok) continue
					const startLocation = offsetToLocation(parsed.sourceText, declaration.start)
					const endLocation = offsetToLocation(parsed.sourceText, declaration.end)
					const ruleId =
						checkResult.reason === "case"
							? "naming-rules/case-mismatch"
							: checkResult.reason === "regex"
								? "naming-rules/regex-mismatch"
								: checkResult.reason === "prefix"
									? "naming-rules/prefix-mismatch"
									: "naming-rules/suffix-mismatch"
					diagnostics.push(
						errorDiagnostic({
							ruleId,
							message: checkResult.description,
							filePath,
							range: { start: startLocation, end: endLocation },
						}),
					)
				}
			}

			if (rule.requireFilenameMatchesExport === true) {
				const exportedNames = declarations
					.filter((declaration) => declaration.exported)
					.map((declaration) => declaration.name)
				const stem = filenameStem(filePath)
				if (exportedNames.length > 0 && !exportedNames.includes(stem)) {
					diagnostics.push(
						errorDiagnostic({
							ruleId: "naming-rules/filename-mismatch",
							message: `filename stem "${stem}" does not match any exported binding in this file (${exportedNames.join(", ")})`,
							filePath,
						}),
					)
				}
			}

			if (rule.requireSingleExport === true) {
				const exportedNames = declarations
					.filter((declaration) => declaration.exported)
					.map((declaration) => declaration.name)
				const distinct = new Set(exportedNames)
				if (distinct.size > 1) {
					diagnostics.push(
						errorDiagnostic({
							ruleId: "naming-rules/multiple-exports",
							message: `file exports ${distinct.size} distinct bindings (${[...distinct].join(", ")}); only one is allowed in files matching "${rule.filePattern}"`,
							filePath,
						}),
					)
				}
			}

			if (rule.forbidDefaultExport === true) {
				const defaultExport = hasDefaultExport(parsed.program)
				if (defaultExport !== null) {
					const startLocation = offsetToLocation(
						parsed.sourceText,
						defaultExport.start,
					)
					const endLocation = offsetToLocation(
						parsed.sourceText,
						defaultExport.end,
					)
					diagnostics.push(
						errorDiagnostic({
							ruleId: "naming-rules/default-export-forbidden",
							message: `default export is forbidden in files matching "${rule.filePattern}" — use a named export`,
							filePath,
							range: { start: startLocation, end: endLocation },
						}),
					)
				}
			}
		}
	}

	return diagnostics
}
