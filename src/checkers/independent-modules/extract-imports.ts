export type ImportSite = {
	source: string
	start: number
	end: number
	kind: "runtime" | "type"
}

export const extractImports = (program: any): ImportSite[] => {
	const result: ImportSite[] = []
	for (const statement of program.body ?? []) {
		if (statement === null || statement === undefined) continue
		switch (statement.type) {
			case "ImportDeclaration":
				if (statement.source?.value !== undefined) {
					result.push({
						source: statement.source.value,
						start: statement.source.start,
						end: statement.source.end,
						kind: statement.importKind === "type" ? "type" : "runtime",
					})
				}
				break
			case "ExportAllDeclaration":
			case "ExportNamedDeclaration":
				if (
					statement.source !== null &&
					statement.source !== undefined &&
					statement.source.value !== undefined
				) {
					result.push({
						source: statement.source.value,
						start: statement.source.start,
						end: statement.source.end,
						kind: statement.exportKind === "type" ? "type" : "runtime",
					})
				}
				break
			default:
				break
		}
	}
	return result
}
