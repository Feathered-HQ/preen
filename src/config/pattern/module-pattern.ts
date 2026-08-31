import path from "node:path"
import picomatch from "picomatch"

export type ModuleMatch = {
	moduleId: string
	rootDir: string
	wildcardSegment: string | null
}

export type CompiledModulePattern = {
	source: string
	matcher: (filePath: string) => ModuleMatch | null
}

const toPosix = (filePath: string): string => filePath.split(path.sep).join("/")

export const compileModulePattern = (
	pattern: string,
): CompiledModulePattern => {
	const normalized = toPosix(pattern).replace(/\/$/, "")
	const segments = normalized.split("/")
	const wildcardIndex = segments.findIndex(
		(segment) => segment === "*" || segment === "**",
	)

	const isMatch = picomatch(normalized, { dot: true })
	const isPrefixMatch = picomatch(`${normalized}/**`, { dot: true })

	return {
		source: normalized,
		matcher: (rawFilePath) => {
			const filePath = toPosix(rawFilePath)
			if (!isMatch(filePath) && !isPrefixMatch(filePath)) {
				return null
			}
			const fileSegments = filePath.split("/")
			let rootSegments: string[]
			let wildcardSegment: string | null = null
			if (wildcardIndex === -1) {
				rootSegments = segments
			} else {
				rootSegments = fileSegments.slice(0, wildcardIndex + 1)
				const lastWildcardSegment = segments[wildcardIndex]
				if (lastWildcardSegment === "*") {
					wildcardSegment = fileSegments[wildcardIndex] ?? null
				} else if (lastWildcardSegment === "**") {
					wildcardSegment = fileSegments
						.slice(wildcardIndex)
						.join("/")
				}
			}
			return {
				moduleId: rootSegments.join("/"),
				rootDir: rootSegments.join("/"),
				wildcardSegment,
			}
		},
	}
}

export type AllowPatternContext = {
	selfModule: ModuleMatch
}

export const expandAllowPattern = (
	pattern: string,
	context: AllowPatternContext,
): string => {
	return pattern
		.replaceAll("{selfModule}", context.selfModule.moduleId)
		.replaceAll("{moduleName}", context.selfModule.wildcardSegment ?? "")
}

export const matchAllowPattern = (
	resolvedPath: string,
	pattern: string,
): boolean => {
	const normalized = toPosix(resolvedPath)
	if (pattern === "node_modules" || pattern === "node_modules/**") {
		return normalized.includes("/node_modules/") || normalized.startsWith("node_modules/")
	}
	const matcher = picomatch(toPosix(pattern), { dot: true })
	return matcher(normalized)
}
