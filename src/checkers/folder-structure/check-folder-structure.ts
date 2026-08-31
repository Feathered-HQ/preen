import fs from "node:fs"
import path from "node:path"
import picomatch from "picomatch"
import { matchesCase } from "../../config/case-style.js"
import {
	compileNamePattern,
	type NamePatternContext,
} from "../../config/pattern/name-pattern.js"
import type {
	FolderEntry,
	FolderRule,
	FolderStructureConfig,
	NameSpec,
} from "../../config/config-schema.js"
import type { Diagnostic } from "../../diagnostics/diagnostic.js"
import { errorDiagnostic } from "../../diagnostics/diagnostic.js"

type EvaluatedEntry = {
	source: FolderEntry
	resolvedName?: NameSpec
	resolvedChildren?: FolderEntry[]
	rule?: FolderRule
}

const resolveEntry = (
	entry: FolderEntry,
	rules: Record<string, FolderRule> | undefined,
): EvaluatedEntry => {
	if (entry.ruleId === undefined) {
		return { source: entry, resolvedName: entry.name, resolvedChildren: entry.children }
	}
	if (rules === undefined || rules[entry.ruleId] === undefined) {
		return { source: entry }
	}
	const rule = rules[entry.ruleId]
	return {
		source: entry,
		resolvedName: entry.name ?? rule?.name,
		resolvedChildren: entry.children ?? rule?.children,
		rule,
	}
}

const matchEntryName = (
	actualName: string,
	spec: NameSpec | undefined,
	context: NamePatternContext,
): boolean => {
	if (spec === undefined) return true
	if (typeof spec === "string") {
		const compiled = compileNamePattern(spec, context)
		return compiled.regex.test(actualName)
	}
	if ("case" in spec) {
		const stem = stemForCase(actualName)
		return matchesCase(stem, spec.case)
	}
	if ("regex" in spec) {
		return new RegExp(spec.regex).test(actualName)
	}
	return false
}

const stemForCase = (name: string): string => {
	const dotIndex = name.indexOf(".")
	if (dotIndex === -1) return name
	return name.slice(0, dotIndex)
}

type DirEntry = {
	name: string
	isDirectory: boolean
}

const readDirectory = (directoryPath: string): DirEntry[] => {
	if (!fs.existsSync(directoryPath)) return []
	return fs
		.readdirSync(directoryPath, { withFileTypes: true })
		.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }))
		.sort((a, b) => a.name.localeCompare(b.name))
}

const isIgnored = (
	relativePath: string,
	ignoreMatchers: ReturnType<typeof picomatch>[],
): boolean => {
	const posix = relativePath.split(path.sep).join("/")
	return ignoreMatchers.some((matcher) => matcher(posix))
}

export type CheckFolderStructureOptions = {
	cwd: string
	config: FolderStructureConfig
	ignorePatterns: string[]
}

export const checkFolderStructure = (
	options: CheckFolderStructureOptions,
): Diagnostic[] => {
	const { cwd, config } = options
	const diagnostics: Diagnostic[] = []
	const ignoreMatchers = options.ignorePatterns.map((pattern) =>
		picomatch(pattern, { dot: true }),
	)
	const root = path.resolve(cwd, config.root)

	const walk = (
		directoryPath: string,
		expectedEntries: FolderEntry[],
		rules: Record<string, FolderRule> | undefined,
		parentFolderName: string,
	): void => {
		const evaluated = expectedEntries.map((entry) => resolveEntry(entry, rules))
		for (const entry of evaluated) {
			if (entry.source.ruleId !== undefined && entry.rule === undefined) {
				diagnostics.push(
					errorDiagnostic({
						ruleId: "folder-structure/unknown-rule-id",
						message: `unknown ruleId "${entry.source.ruleId}"`,
						filePath: directoryPath,
					}),
				)
			}
		}
		const dirEntries = readDirectory(directoryPath)
		const consumed = new Set<string>()

		for (const child of dirEntries) {
			const childPath = path.join(directoryPath, child.name)
			const relative = path.relative(cwd, childPath)
			if (isIgnored(relative, ignoreMatchers)) {
				consumed.add(child.name)
				continue
			}

			const matched = evaluated.find((entry) =>
				matchEntryName(child.name, entry.resolvedName, {
					folderName: parentFolderName,
					parentFolderName,
				}),
			)

			if (matched === undefined) {
				if (!config.allowExtraTopLevelEntries || directoryPath !== root) {
					diagnostics.push(
						errorDiagnostic({
							ruleId: "folder-structure/disallowed-entry",
							message: `unexpected ${child.isDirectory ? "directory" : "file"} "${child.name}"`,
							filePath: childPath,
						}),
					)
				}
				continue
			}

			if (matched.source.disallow === true) {
				diagnostics.push(
					errorDiagnostic({
						ruleId: "folder-structure/disallowed-entry",
						message: `entry "${child.name}" matches a disallow rule`,
						filePath: childPath,
					}),
				)
				continue
			}

			consumed.add(child.name)

			if (child.isDirectory && matched.resolvedChildren !== undefined) {
				const folderName = matched.resolvedName !== undefined
					? child.name
					: parentFolderName
				walk(
					childPath,
					matched.resolvedChildren,
					rules,
					folderName,
				)
			}
		}

		for (const entry of evaluated) {
			if (entry.source.optional === true) continue
			if (entry.source.disallow === true) continue
			if (entry.resolvedName === undefined) continue
			if (typeof entry.resolvedName !== "string") continue
			// Expand the two simple context tokens so we can enforce
			// "a folder named X must contain X.tsx". Any remaining `{...}`
			// after this is a case-style token whose expansion depends on
			// the actual file (not the parent folder) and can't be
			// resolved without a candidate name — skip those.
			let expectedName = entry.resolvedName
				.replace(/\{folderName\}/g, parentFolderName)
				.replace(/\{parentFolderName\}/g, parentFolderName)
			if (expectedName.includes("{")) continue
			if (consumed.has(expectedName)) continue
			diagnostics.push(
				errorDiagnostic({
					ruleId: "folder-structure/missing-required",
					message: `missing required entry "${expectedName}"`,
					filePath: path.join(directoryPath, expectedName),
				}),
			)
		}
	}

	walk(root, config.structure, config.rules, path.basename(root))
	return diagnostics
}
