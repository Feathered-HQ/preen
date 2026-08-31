import path from "node:path"
import { glob } from "tinyglobby"
import { checkBannedPatterns } from "./checkers/banned-patterns/check-banned-patterns.js"
import { checkFolderStructure } from "./checkers/folder-structure/check-folder-structure.js"
import { checkIndependentModules } from "./checkers/independent-modules/check-independent-modules.js"
import { checkNamingRules } from "./checkers/naming-rules/check-naming-rules.js"
import { checkRelativeImports } from "./checkers/relative-imports/check-relative-imports.js"
import { checkTestPairing } from "./checkers/test-pairing/check-test-pairing.js"
import type { ProjectStructureConfig } from "./config/config-schema.js"
import type { Diagnostic } from "./diagnostics/diagnostic.js"

export type RunChecksOptions = {
	cwd: string
	config: ProjectStructureConfig
}

export type RunChecksResult = {
	diagnostics: Diagnostic[]
	scannedFileCount: number
	durationMs: number
}

const collectFiles = async (
	cwd: string,
	include: string[],
	ignorePatterns: string[],
): Promise<string[]> => {
	const matched = await glob(include, {
		cwd,
		absolute: true,
		ignore: ignorePatterns,
		dot: false,
		onlyFiles: true,
	})
	return matched.map((entry) => entry.split(path.sep).join("/"))
}

export const runChecks = async (
	options: RunChecksOptions,
): Promise<RunChecksResult> => {
	const startTime = Date.now()
	const { cwd, config } = options

	const files = await collectFiles(cwd, config.include, config.ignorePatterns)

	const diagnostics: Diagnostic[] = []

	if (config.bannedPatterns.length > 0) {
		diagnostics.push(
			...checkBannedPatterns({
				cwd,
				files,
				patterns: config.bannedPatterns,
			}),
		)
	}

	if (config.folderStructure !== undefined) {
		diagnostics.push(
			...checkFolderStructure({
				cwd,
				config: config.folderStructure,
				ignorePatterns: config.ignorePatterns,
			}),
		)
	}

	if (config.namingRules.length > 0) {
		diagnostics.push(
			...checkNamingRules({ cwd, files, rules: config.namingRules }),
		)
	}

	if (config.independentModules.length > 0) {
		diagnostics.push(
			...checkIndependentModules({
				cwd,
				files,
				rules: config.independentModules,
				tsconfig: config.tsconfig,
				workspaceRoot: config.workspaceRoot,
			}),
		)
	}

	if (config.forbidRelativeParentImports) {
		diagnostics.push(...checkRelativeImports({ files }))
	}

	if (config.requireTestPairing) {
		// Scan for test files directly — they're in `ignorePatterns` so the
		// main `files` list excludes them.
		const testGlobs = ["**/*.test.{ts,tsx,js,jsx,mjs,cjs}"]
		diagnostics.push(...(await checkTestPairing({ cwd, testGlobs })))
	}

	return {
		diagnostics,
		scannedFileCount: files.length,
		durationMs: Date.now() - startTime,
	}
}
