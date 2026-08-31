import type { NamingKind } from "../../config/config-schema.js"

export type TopLevelDeclaration = {
	kind: NamingKind
	name: string
	exported: boolean
	start: number
	end: number
}

const collectIdsFromPattern = (
	pattern: any,
	collected: { name: string; start: number; end: number }[],
): void => {
	if (pattern === null || pattern === undefined) return
	switch (pattern.type) {
		case "Identifier":
			collected.push({ name: pattern.name, start: pattern.start, end: pattern.end })
			return
		case "ObjectPattern":
			for (const property of pattern.properties ?? []) {
				if (property.type === "Property") {
					collectIdsFromPattern(property.value, collected)
				} else if (property.type === "RestElement") {
					collectIdsFromPattern(property.argument, collected)
				}
			}
			return
		case "ArrayPattern":
			for (const element of pattern.elements ?? []) {
				if (element !== null) collectIdsFromPattern(element, collected)
			}
			return
		case "AssignmentPattern":
			collectIdsFromPattern(pattern.left, collected)
			return
		case "RestElement":
			collectIdsFromPattern(pattern.argument, collected)
			return
		default:
			return
	}
}

const declarationsFromVariable = (
	variableDeclaration: any,
	exported: boolean,
): TopLevelDeclaration[] => {
	const result: TopLevelDeclaration[] = []
	for (const declarator of variableDeclaration.declarations ?? []) {
		const collected: { name: string; start: number; end: number }[] = []
		collectIdsFromPattern(declarator.id, collected)
		for (const binding of collected) {
			result.push({
				kind: "variable",
				name: binding.name,
				exported,
				start: binding.start,
				end: binding.end,
			})
		}
	}
	return result
}

const declarationFromNamed = (
	node: any,
	exported: boolean,
): TopLevelDeclaration[] => {
	switch (node.type) {
		case "VariableDeclaration":
			return declarationsFromVariable(node, exported)
		case "FunctionDeclaration":
			if (node.id === null || node.id === undefined) return []
			return [
				{
					kind: "function",
					name: node.id.name,
					exported,
					start: node.id.start,
					end: node.id.end,
				},
			]
		case "ClassDeclaration":
			if (node.id === null || node.id === undefined) return []
			return [
				{
					kind: "class",
					name: node.id.name,
					exported,
					start: node.id.start,
					end: node.id.end,
				},
			]
		case "TSTypeAliasDeclaration":
			return [
				{
					kind: "type",
					name: node.id.name,
					exported,
					start: node.id.start,
					end: node.id.end,
				},
			]
		case "TSInterfaceDeclaration":
			return [
				{
					kind: "interface",
					name: node.id.name,
					exported,
					start: node.id.start,
					end: node.id.end,
				},
			]
		case "TSEnumDeclaration":
			return [
				{
					kind: "enum",
					name: node.id.name,
					exported,
					start: node.id.start,
					end: node.id.end,
				},
			]
		default:
			return []
	}
}

export const hasDefaultExport = (program: any): { start: number; end: number } | null => {
	for (const statement of program.body ?? []) {
		if (statement === null || statement === undefined) continue
		if (statement.type === "ExportDefaultDeclaration") {
			return { start: statement.start, end: statement.end }
		}
	}
	return null
}

export const extractTopLevelDeclarations = (
	program: any,
): TopLevelDeclaration[] => {
	const result: TopLevelDeclaration[] = []
	for (const statement of program.body ?? []) {
		if (statement === null || statement === undefined) continue
		switch (statement.type) {
			case "ExportNamedDeclaration":
				if (statement.declaration !== null && statement.declaration !== undefined) {
					result.push(...declarationFromNamed(statement.declaration, true))
				}
				for (const specifier of statement.specifiers ?? []) {
					if (specifier.type === "ExportSpecifier") {
						const exportedNode = specifier.exported
						if (exportedNode !== undefined) {
							const name =
								exportedNode.type === "Identifier"
									? exportedNode.name
									: exportedNode.value
							if (typeof name === "string") {
								result.push({
									kind: "variable",
									name,
									exported: true,
									start: exportedNode.start,
									end: exportedNode.end,
								})
							}
						}
					}
				}
				break
			case "ExportDefaultDeclaration":
				break
			case "VariableDeclaration":
			case "FunctionDeclaration":
			case "ClassDeclaration":
			case "TSTypeAliasDeclaration":
			case "TSInterfaceDeclaration":
			case "TSEnumDeclaration":
				result.push(...declarationFromNamed(statement, false))
				break
			default:
				break
		}
	}
	return result
}
