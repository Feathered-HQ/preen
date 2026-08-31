import { z } from "zod"

const caseStyleSchema = z.enum([
	"kebab-case",
	"camelCase",
	"PascalCase",
	"snake_case",
	"CONSTANT_CASE",
	"dot.case",
])

const nameSpecSchema = z.union([
	z.string(),
	z.object({
		case: caseStyleSchema,
	}),
	z.object({
		regex: z.string(),
	}),
])

type FolderEntryInput = {
	name?: z.infer<typeof nameSpecSchema>
	ruleId?: string
	optional?: boolean
	disallow?: boolean
	children?: FolderEntryInput[]
}

const folderEntrySchema: z.ZodType<FolderEntryInput> = z.lazy(() =>
	z
		.object({
			name: nameSpecSchema.optional(),
			ruleId: z.string().optional(),
			optional: z.boolean().optional(),
			disallow: z.boolean().optional(),
			children: z.array(folderEntrySchema).optional(),
		})
		.refine((entry) => entry.name !== undefined || entry.ruleId !== undefined, {
			message:
				"folder entry must define either `name` or `ruleId` (or both)",
		}),
)

const folderRuleSchema: z.ZodType<{
	name?: z.infer<typeof nameSpecSchema>
	children?: FolderEntryInput[]
}> = z.object({
	name: nameSpecSchema.optional(),
	children: z.array(folderEntrySchema).optional(),
})

const folderStructureSchema = z.object({
	root: z.string().default("."),
	structure: z.array(folderEntrySchema),
	rules: z.record(z.string(), folderRuleSchema).optional(),
	allowExtraTopLevelEntries: z.boolean().default(true),
})

const namingKindSchema = z.enum([
	"variable",
	"function",
	"class",
	"type",
	"interface",
	"enum",
])

const namingTargetSchema = z.object({
	case: caseStyleSchema.optional(),
	regex: z.string().optional(),
	prefix: z.string().optional(),
	suffix: z.string().optional(),
})

const namingRuleSchema = z.object({
	filePattern: z.string(),
	allowOnly: z.array(namingKindSchema).optional(),
	variable: namingTargetSchema.optional(),
	function: namingTargetSchema.optional(),
	class: namingTargetSchema.optional(),
	type: namingTargetSchema.optional(),
	interface: namingTargetSchema.optional(),
	enum: namingTargetSchema.optional(),
	requireFilenameMatchesExport: z.boolean().optional(),
	/**
	 * When true, the file must export exactly one distinct binding name.
	 * Multiple declarations sharing the same name (e.g. `export type Foo` +
	 * `export const Foo`) count as one. Files with no exports are ignored.
	 */
	requireSingleExport: z.boolean().optional(),
	/**
	 * When true, the file may not use `export default`. Default exports are
	 * forbidden by the codebase convention (named exports only).
	 */
	forbidDefaultExport: z.boolean().optional(),
})

const independentModuleSchema = z.object({
	module: z.string(),
	allowImportsFrom: z.array(z.string()),
	denyImportsFrom: z.array(z.string()).optional(),
})

const bannedPatternSchema = z.object({
	pattern: z.string(),
	reason: z.string().optional(),
})

export const configSchema = z.object({
	root: z.string().default("."),
	workspaceRoot: z.string().optional(),
	include: z.array(z.string()).default(["src/**/*.{ts,tsx,js,jsx,mjs,cjs}"]),
	ignorePatterns: z.array(z.string()).default([]),
	tsconfig: z.string().optional(),
	folderStructure: folderStructureSchema.optional(),
	namingRules: z.array(namingRuleSchema).default([]),
	independentModules: z.array(independentModuleSchema).default([]),
	bannedPatterns: z
		.array(z.union([z.string(), bannedPatternSchema]))
		.default([]),
	/**
	 * When true, every relative import whose specifier starts with `..` is
	 * flagged. Forces cross-folder imports to use the package alias path,
	 * making the dependency graph readable from the import statements alone.
	 */
	forbidRelativeParentImports: z.boolean().default(false),
	/**
	 * When true, every `*.test.{ts,tsx}` file must have a sibling source
	 * file (e.g. `Foo.test.tsx` requires `Foo.tsx` or `Foo.ts` in the same
	 * directory). Catches orphan tests left behind by refactors.
	 */
	requireTestPairing: z.boolean().default(false),
})

export type ProjectStructureConfig = z.infer<typeof configSchema>
export type FolderStructureConfig = z.infer<typeof folderStructureSchema>
export type FolderEntry = FolderEntryInput
export type FolderRule = z.infer<typeof folderRuleSchema>
export type NameSpec = z.infer<typeof nameSpecSchema>
export type NamingRule = z.infer<typeof namingRuleSchema>
export type NamingTarget = z.infer<typeof namingTargetSchema>
export type NamingKind = z.infer<typeof namingKindSchema>
export type IndependentModuleRule = z.infer<typeof independentModuleSchema>
export type BannedPattern = z.infer<typeof bannedPatternSchema>
