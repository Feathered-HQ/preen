import fs from "node:fs"
import path from "node:path"
import { glob } from "tinyglobby"

import type { Diagnostic } from "../../diagnostics/diagnostic.js"
import { errorDiagnostic } from "../../diagnostics/diagnostic.js"

export type CheckTestPairingOptions = {
	cwd: string
	testGlobs: string[]
}

const TEST_SUFFIX = /\.test\.(tsx?|jsx?|mjs|cjs)$/
const SOURCE_EXTENSIONS = [".ts", ".tsx"] as const

export const checkTestPairing = async (
	options: CheckTestPairingOptions,
): Promise<Diagnostic[]> => {
	const diagnostics: Diagnostic[] = []

	const testFiles = await glob(options.testGlobs, {
		cwd: options.cwd,
		absolute: true,
		ignore: ["**/node_modules/**", "**/dist/**"],
		dot: false,
		onlyFiles: true,
	})

	for (const filePath of testFiles) {
		const normalized = filePath.split(path.sep).join("/")
		const base = path.basename(normalized)
		if (!TEST_SUFFIX.test(base)) continue

		const stem = base.replace(TEST_SUFFIX, "")
		const directory = path.dirname(normalized)

		const hasSourceSibling = SOURCE_EXTENSIONS.some((ext) =>
			fs.existsSync(path.join(directory, `${stem}${ext}`)),
		)

		if (!hasSourceSibling) {
			diagnostics.push(
				errorDiagnostic({
					ruleId: "test-pairing/orphan-test",
					message: `test file "${base}" has no sibling source file (expected "${stem}.ts" or "${stem}.tsx")`,
					filePath: normalized,
				}),
			)
		}
	}

	return diagnostics
}
