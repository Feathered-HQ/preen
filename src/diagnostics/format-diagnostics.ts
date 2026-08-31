import path from "node:path"
import kleur from "kleur"
import type { Diagnostic } from "./diagnostic.js"

const severityLabel = (severity: Diagnostic["severity"]): string =>
	severity === "error" ? kleur.red().bold("error") : kleur.yellow().bold("warning")

export const formatDiagnostics = (
	diagnostics: Diagnostic[],
	options: { cwd: string; useColor?: boolean },
): string => {
	if (!options.useColor) {
		kleur.enabled = false
	}
	if (diagnostics.length === 0) {
		return kleur.green("preen: no problems found")
	}
	const grouped = new Map<string, Diagnostic[]>()
	for (const diagnostic of diagnostics) {
		const key = diagnostic.filePath
		const list = grouped.get(key)
		if (list === undefined) {
			grouped.set(key, [diagnostic])
		} else {
			list.push(diagnostic)
		}
	}
	const lines: string[] = []
	for (const [filePath, items] of grouped) {
		const relative = path.relative(options.cwd, filePath) || filePath
		lines.push(kleur.underline(relative))
		for (const item of items) {
			const location =
				item.range !== undefined
					? kleur.dim(`:${item.range.start.line}:${item.range.start.column}`)
					: ""
			lines.push(
				`  ${severityLabel(item.severity)}${location} ${item.message} ${kleur.dim(`(${item.ruleId})`)}`,
			)
		}
		lines.push("")
	}
	const errorCount = diagnostics.filter((d) => d.severity === "error").length
	const warningCount = diagnostics.length - errorCount
	const summaryParts: string[] = []
	if (errorCount > 0) summaryParts.push(`${errorCount} error${errorCount === 1 ? "" : "s"}`)
	if (warningCount > 0)
		summaryParts.push(`${warningCount} warning${warningCount === 1 ? "" : "s"}`)
	const summary = summaryParts.join(", ") || "0 problems"
	const summaryColor = errorCount > 0 ? kleur.red : kleur.yellow
	lines.push(summaryColor().bold(`preen: ${summary}`))
	return lines.join("\n")
}
