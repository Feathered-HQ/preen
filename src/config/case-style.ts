export type CaseStyle =
	| "kebab-case"
	| "camelCase"
	| "PascalCase"
	| "snake_case"
	| "CONSTANT_CASE"
	| "dot.case"

export const ALL_CASE_STYLES: readonly CaseStyle[] = [
	"kebab-case",
	"camelCase",
	"PascalCase",
	"snake_case",
	"CONSTANT_CASE",
	"dot.case",
] as const

const CASE_PATTERNS: Record<CaseStyle, RegExp> = {
	"kebab-case": /^[a-z0-9]+(-[a-z0-9]+)*$/,
	camelCase: /^[a-z][a-zA-Z0-9]*$/,
	PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
	snake_case: /^[a-z0-9]+(_[a-z0-9]+)*$/,
	CONSTANT_CASE: /^[A-Z0-9]+(_[A-Z0-9]+)*$/,
	"dot.case": /^[a-z0-9]+(\.[a-z0-9]+)*$/,
}

export const matchesCase = (token: string, style: CaseStyle): boolean => {
	if (token.length === 0) return false
	return CASE_PATTERNS[style].test(token)
}

export const caseAsRegexFragment = (style: CaseStyle): string => {
	return CASE_PATTERNS[style].source.replace(/^\^/, "").replace(/\$$/, "")
}
