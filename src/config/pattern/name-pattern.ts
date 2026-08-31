import { caseAsRegexFragment, type CaseStyle } from "../case-style.js"

export type NamePatternContext = {
	folderName?: string
	parentFolderName?: string
}

const CASE_TOKEN_MAP: Record<string, CaseStyle> = {
	"{kebab-case}": "kebab-case",
	"{kebabCase}": "kebab-case",
	"{camelCase}": "camelCase",
	"{PascalCase}": "PascalCase",
	"{snake_case}": "snake_case",
	"{snakeCase}": "snake_case",
	"{CONSTANT_CASE}": "CONSTANT_CASE",
	"{constantCase}": "CONSTANT_CASE",
	"{dot.case}": "dot.case",
}

export type CompiledNamePattern = {
	source: string
	regex: RegExp
}

const escapeRegex = (text: string): string =>
	text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const compileNamePattern = (
	pattern: string,
	context: NamePatternContext = {},
): CompiledNamePattern => {
	const tokenRegex = /\{[A-Za-z_.\\-]+(?:Case)?\}|\{folderName\}|\{parentFolderName\}/g
	let cursor = 0
	let regexBody = ""
	for (const match of pattern.matchAll(tokenRegex)) {
		const literal = pattern.slice(cursor, match.index)
		regexBody += escapeRegex(literal)
		const token = match[0]
		if (token === "{folderName}") {
			if (context.folderName === undefined) {
				throw new Error(
					`name pattern "${pattern}" uses {folderName} but no folder context was supplied`,
				)
			}
			regexBody += escapeRegex(context.folderName)
		} else if (token === "{parentFolderName}") {
			if (context.parentFolderName === undefined) {
				throw new Error(
					`name pattern "${pattern}" uses {parentFolderName} but no parent folder context was supplied`,
				)
			}
			regexBody += escapeRegex(context.parentFolderName)
		} else if (token in CASE_TOKEN_MAP) {
			const style = CASE_TOKEN_MAP[token]
			if (style === undefined) {
				throw new Error(`unknown case token: ${token}`)
			}
			regexBody += `(?:${caseAsRegexFragment(style)})`
		} else {
			throw new Error(`unknown token in name pattern "${pattern}": ${token}`)
		}
		cursor = match.index + token.length
	}
	regexBody += escapeRegex(pattern.slice(cursor))
	return {
		source: pattern,
		regex: new RegExp(`^${regexBody}$`),
	}
}

export const matchesNamePattern = (
	value: string,
	pattern: CompiledNamePattern,
): boolean => pattern.regex.test(value)
