/**
 * Filename-pattern DSL. Produces `{ regex }` objects compatible with the
 * folder-structure entry `name` field.
 *
 * Replaces inline regex strings like `^[a-z][A-Za-z0-9]*Store\\.ts$` with
 * readable expressions like `fileNamePattern.camelCase("Store.ts")`.
 *
 * Compiles to the SAME underlying regex — purely a sugar layer.
 */

const escapeRegex = (s: string): string =>
	s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export type FileNamePattern = { regex: string }

/**
 * PascalCase identifier, optionally with a literal suffix.
 *
 *   pascalCase()             → ^[A-Z][A-Za-z0-9]*$
 *   pascalCase(".tsx")       → ^[A-Z][A-Za-z0-9]*\.tsx$
 *   pascalCase("Route.tsx")  → ^[A-Z][A-Za-z0-9]*Route\.tsx$
 */
const pascalCase = (suffix?: string): FileNamePattern => ({
	regex: suffix
		? `^[A-Z][A-Za-z0-9]*${escapeRegex(suffix)}$`
		: `^[A-Z][A-Za-z0-9]*$`,
})

/**
 * camelCase identifier, optionally with a literal suffix.
 *
 *   camelCase("Store.ts")  → ^[a-z][A-Za-z0-9]*Store\.ts$
 */
const camelCase = (suffix?: string): FileNamePattern => ({
	regex: suffix
		? `^[a-z][A-Za-z0-9]*${escapeRegex(suffix)}$`
		: `^[a-z][A-Za-z0-9]*$`,
})

/**
 * kebab-case identifier, optionally with a literal suffix.
 *
 *   kebabCase()         → ^[a-z0-9]+(-[a-z0-9]+)*$
 *   kebabCase(".ts")    → ^[a-z0-9]+(-[a-z0-9]+)*\.ts$
 */
const kebabCase = (suffix?: string): FileNamePattern => ({
	regex: suffix
		? `^[a-z0-9]+(-[a-z0-9]+)*${escapeRegex(suffix)}$`
		: `^[a-z0-9]+(-[a-z0-9]+)*$`,
})

/**
 * Filename starting with a literal prefix and ending with a literal suffix.
 *
 *   startsWith("use", "Mutation.ts")  → ^use.+Mutation\.ts$
 */
const startsWith = (prefix: string, suffix: string): FileNamePattern => ({
	regex: `^${escapeRegex(prefix)}.+${escapeRegex(suffix)}$`,
})

/**
 * Filename ending with a literal suffix, anything before.
 *
 *   endsWith(".ts")  → .+\.ts$
 */
const endsWith = (suffix: string): FileNamePattern => ({
	regex: `.+${escapeRegex(suffix)}$`,
})

/**
 * Filename ending with a literal suffix, but NOT starting with the given
 * prefix. When `followedByUppercase` is true, the ban only applies when
 * the prefix is followed by a capital letter — useful for excluding the
 * React hook convention (`use<Capital>`) from a wider pattern.
 *
 *   notStartingWith("use", { followedByUppercase: true, suffix: "Query.ts" })
 *     → ^(?!use[A-Z]).+Query\.ts$
 *
 * That pattern allows `userQuery.ts` (lowercase r) but rejects `useFooQuery.ts`.
 */
const notStartingWith = (
	bannedPrefix: string,
	options: { followedByUppercase?: boolean; suffix: string },
): FileNamePattern => {
	const tail = options.followedByUppercase === true ? "[A-Z]" : ""
	return {
		regex: `^(?!${escapeRegex(bannedPrefix)}${tail}).+${escapeRegex(options.suffix)}$`,
	}
}

/**
 * Escape hatch — raw regex source. Use only when the helpers above don't
 * cover your case.
 */
const raw = (regex: string): FileNamePattern => ({ regex })

/**
 * Pre-baked patterns for the common VSA conventions, so configs can read
 * `fileNamePattern.useMutation` instead of repeating the recipe.
 */
const useMutation = (): FileNamePattern => startsWith("use", "Mutation.ts")
const useHook = (): FileNamePattern => startsWith("use", ".ts")
const nonHookQuery = (): FileNamePattern =>
	notStartingWith("use", { followedByUppercase: true, suffix: "Query.ts" })

export const fileNamePattern = {
	pascalCase,
	camelCase,
	kebabCase,
	startsWith,
	endsWith,
	notStartingWith,
	raw,
	useMutation,
	useHook,
	nonHookQuery,
}
