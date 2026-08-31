import fs from "node:fs"
import { parseSync } from "oxc-parser"

export type ParsedFile = {
	filePath: string
	sourceText: string
	program: any
}

export const parseSourceFile = (filePath: string): ParsedFile => {
	const sourceText = fs.readFileSync(filePath, "utf8")
	const result = parseSync(filePath, sourceText)
	return {
		filePath,
		sourceText,
		program: result.program,
	}
}

export type SourceLocation = {
	line: number
	column: number
	offset: number
}

export const offsetToLocation = (
	sourceText: string,
	offset: number,
): SourceLocation => {
	const safeOffset = Math.max(0, Math.min(offset, sourceText.length))
	let line = 1
	let lastNewline = -1
	for (let index = 0; index < safeOffset; index += 1) {
		if (sourceText.charCodeAt(index) === 10) {
			line += 1
			lastNewline = index
		}
	}
	const column = safeOffset - lastNewline
	return { line, column, offset: safeOffset }
}
