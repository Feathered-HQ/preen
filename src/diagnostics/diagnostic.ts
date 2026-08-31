export type DiagnosticSeverity = "error" | "warning"

export type DiagnosticRange = {
	start: { line: number; column: number; offset: number }
	end: { line: number; column: number; offset: number }
}

export type Diagnostic = {
	ruleId:
		| "folder-structure/missing-required"
		| "folder-structure/disallowed-entry"
		| "folder-structure/name-mismatch"
		| "folder-structure/unknown-rule-id"
		| "banned-pattern/match"
		| "naming-rules/disallowed-export-kind"
		| "naming-rules/case-mismatch"
		| "naming-rules/regex-mismatch"
		| "naming-rules/prefix-mismatch"
		| "naming-rules/suffix-mismatch"
		| "naming-rules/filename-mismatch"
		| "naming-rules/multiple-exports"
		| "naming-rules/default-export-forbidden"
		| "imports/relative-parent"
		| "test-pairing/orphan-test"
		| "independent-modules/import-not-allowed"
		| "independent-modules/import-explicitly-denied"
		| "independent-modules/unresolvable-import"
		| "config/parse-error"
	severity: DiagnosticSeverity
	message: string
	filePath: string
	range?: DiagnosticRange
}

export const errorDiagnostic = (
	properties: Omit<Diagnostic, "severity">,
): Diagnostic => ({
	severity: "error",
	...properties,
})

export const warningDiagnostic = (
	properties: Omit<Diagnostic, "severity">,
): Diagnostic => ({
	severity: "warning",
	...properties,
})
