import type { Diagnostic } from "../../diagnostics/diagnostic.js"
import { errorDiagnostic } from "../../diagnostics/diagnostic.js"
import { extractImports } from "../independent-modules/extract-imports.js"
import {
	offsetToLocation,
	parseSourceFile,
} from "../naming-rules/parse-source-file.js"

export type CheckRelativeImportsOptions = {
	files: string[]
}

export const checkRelativeImports = (
	options: CheckRelativeImportsOptions,
): Diagnostic[] => {
	const diagnostics: Diagnostic[] = []

	for (const filePath of options.files) {
		let parsed: ReturnType<typeof parseSourceFile>
		try {
			parsed = parseSourceFile(filePath)
		} catch {
			// Parse errors surface elsewhere — skip silently here.
			continue
		}
		const imports = extractImports(parsed.program)

		for (const importSite of imports) {
			if (importSite.source.startsWith("..")) {
				const start = offsetToLocation(parsed.sourceText, importSite.start)
				const end = offsetToLocation(parsed.sourceText, importSite.end)
				diagnostics.push(
					errorDiagnostic({
						ruleId: "imports/relative-parent",
						message: `relative parent import "${importSite.source}" is forbidden — use the package alias path instead`,
						filePath,
						range: { start, end },
					}),
				)
			}
		}
	}

	return diagnostics
}
