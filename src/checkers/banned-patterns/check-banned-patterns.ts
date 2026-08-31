import path from "node:path"
import picomatch from "picomatch"
import type { BannedPattern } from "../../config/config-schema.js"
import type { Diagnostic } from "../../diagnostics/diagnostic.js"
import { errorDiagnostic } from "../../diagnostics/diagnostic.js"

export type CheckBannedPatternsOptions = {
	cwd: string
	files: string[]
	patterns: (string | BannedPattern)[]
}

type Compiled = {
	source: string
	reason: string | undefined
	matcher: ReturnType<typeof picomatch>
}

export const checkBannedPatterns = (
	options: CheckBannedPatternsOptions,
): Diagnostic[] => {
	if (options.patterns.length === 0) return []
	const compiled: Compiled[] = options.patterns.map((entry) => {
		const source = typeof entry === "string" ? entry : entry.pattern
		const reason = typeof entry === "string" ? undefined : entry.reason
		return {
			source,
			reason,
			matcher: picomatch(source, { dot: true }),
		}
	})
	const diagnostics: Diagnostic[] = []
	for (const filePath of options.files) {
		const cwdRelative = path
			.relative(options.cwd, filePath)
			.split(path.sep)
			.join("/")
		for (const entry of compiled) {
			if (!entry.matcher(cwdRelative)) continue
			const reasonSuffix =
				entry.reason !== undefined ? ` — ${entry.reason}` : ""
			diagnostics.push(
				errorDiagnostic({
					ruleId: "banned-pattern/match",
					message: `path matches banned pattern "${entry.source}"${reasonSuffix}`,
					filePath,
				}),
			)
		}
	}
	return diagnostics
}
