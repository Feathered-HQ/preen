import type { UserConfig } from "../define-config.js"
import { fileNamePattern } from "../dsl/fileNamePattern.js"

/**
 * Options for `vsaPackage()`.
 */
export type VsaPackageOptions = {
	/**
	 * Workspace-relative path to this package. Examples:
	 *   "common"          → root-level common package
	 *   "slices/mcp"      → a vertical slice
	 *   "apps/backend"    → an application composition root (uses overrides)
	 */
	path: string
	/**
	 * Other packages this one may import from (workspace-relative paths).
	 *
	 * Cross-package access is tier-matched on both sides:
	 *   - shared/lib is universal — every tier may import peer/shared/lib
	 *   - shared/<T> is reachable only from the same tier name:
	 *       this/client/hooks may pull peer/shared/hooks (not peer/shared/components)
	 *       this/server/procedures may pull peer/shared/procedures
	 *   - Within client/server, peer access also tier-matches:
	 *       this/client/lib    → peer/client/lib only
	 *       this/client/hooks  → peer/client/lib + peer/client/hooks
	 *       this/server/lib    → peer/server/lib only
	 *       this/server/procedures → peer/server/lib + peer/server/procedures
	 */
	peers?: string[]
	/**
	 * Extra glob patterns to ignore beyond the VSA defaults.
	 *   Default ignores: node_modules, dist, the config file itself,
	 *   `**\/*.test.{ts,tsx}`.
	 */
	extraIgnorePatterns?: string[]
	/** Graph metadata. Defaults to the final segment of `path`. */
	graph?: {
		sliceId?: string
	}
	/**
	 * Replace whole sections of the generated config. Use sparingly —
	 * the whole point of this preset is to NOT need overrides.
	 */
	overrides?: Partial<UserConfig>
}

/**
 * Standard banned-filenames list. Identical across every VSA package.
 */
const vsaBannedPatterns = () => [
	{
		pattern: "**/utils.{ts,tsx}",
		reason: "use one-export-per-file named after the export",
	},
	{
		pattern: "**/utils/**",
		reason: "`utils/` is banned as a folder name — use `lib/`",
	},
	{
		pattern: "**/helpers.{ts,tsx}",
		reason: "use one-export-per-file named after the export",
	},
	{
		pattern: "**/helpers/**",
		reason: "`helpers/` is banned as a folder name — use `lib/`",
	},
	{
		pattern: "**/manager.{ts,tsx}",
		reason: "`manager` is banned as a filename",
	},
	{
		pattern: "**/types.{ts,tsx}",
		reason: "use one type per file named after the type",
	},
	{
		pattern: "**/consts.{ts,tsx}",
		reason: "use one constant per file named after the constant",
	},
	{ pattern: "**/common.{ts,tsx}", reason: "`common` is banned as a filename" },
	{ pattern: "**/shared.{ts,tsx}", reason: "`shared` is banned as a filename" },
	{
		pattern: "**/index.{ts,tsx}",
		reason: "barrel exports are banned (VSA rule 8) — use `exports` map",
	},
	{
		pattern: "**/lib/**/*.tsx",
		reason:
			"`.tsx` belongs in `components/` or `routes/` — `lib/` is runtime helpers only",
	},
]

/**
 * Folder-structure config. Shape is identical across every VSA package;
 * only the structure rules below ever change.
 *
 * Notes on composition:
 *   - `subComponentFolderChildren` and `componentFolderChildren` are
 *     plain JS arrays. Sub-component declaration happens before its
 *     consumer so the reference resolves at module load.
 *   - The tier-shared shape (`tierChildren`) is reused by `server/` and
 *     `shared/` — same plain variable, no string indirection.
 */
const vsaFolderStructure = () => {
	// Leaf sub-component: `<Sub>/<Sub>.tsx` only. Nesting stops here — one level
	// deep. Sub-components get no local tiers of their own because the import
	// engine's `{selfModule}` token resolves to the *top-level* component folder,
	// so a deeper tier could not address its own folder. Lift anything shared to
	// the parent component's `lib`/`hooks` or to `common`.
	const subComponentFolderChildren = [{ name: "{folderName}.tsx" }]

	// A component folder's nested `components/` dir holds PascalCase
	// sub-component folders only — no flat files.
	const nestedComponentsEntry = {
		children: [
			{
				children: subComponentFolderChildren,
				name: fileNamePattern.pascalCase(),
				optional: true,
			},
		],
		name: "components",
		optional: true,
	}

	// Top-level component folder = a mini-slice: `<Name>.tsx` plus an optional
	// local `lib/`, local `hooks/` (use*.ts), and a nested `components/` dir.
	// Local `queries/`/`mutations/` are intentionally absent — those stay at the
	// client tier root.
	const componentFolderChildren = [
		{ name: "{folderName}.tsx" },
		{ name: "lib", optional: true },
		{
			children: [{ name: fileNamePattern.useHook(), optional: true }],
			name: "hooks",
			optional: true,
		},
		nestedComponentsEntry,
	]

	// `types/` is a tier-local PascalCase-only folder for type-only exports.
	// It's structurally identical under client/, server/, and shared/.
	// Each file = one PascalCase type/interface/enum named after the file.
	const typesTierEntry = {
		children: [{ name: fileNamePattern.pascalCase(".ts"), optional: true }],
		name: "types",
		optional: true,
	}

	// `shared/` accepts `lib/` (runtime helpers) and `types/` (type-only).
	// No flat files at the tier root.
	const sharedTierChildren = [{ name: "lib", optional: true }, typesTierEntry]

	// `server/` accepts three structured tiers plus a single flat composition
	// file at the tier root:
	//
	//   lib/         — pure helpers + stateful service classes (queues,
	//                  pollers, workers) AND middleware (auth, rate-limiting,
	//                  request-logging fns). Anything stateful or composable
	//                  that isn't a procedure/route lives here.
	//   types/       — type-only exports, PascalCase filename = export name.
	//   procedures/  — tRPC procedures, flat: `procedures/<name>.ts`.
	//   routes/      — HTTP route handlers for things tRPC doesn't fit
	//                  (SSE streams, file uploads, OAuth callbacks).
	//   router.ts    — single composition file at tier root. Each slice
	//                  defines its tRPC sub-router here; the app's main
	//                  router merges the per-slice routers.
	const serverTierChildren = [
		{ name: "router.ts", optional: true },
		{ name: "lib", optional: true },
		typesTierEntry,
		{
			children: [{ name: fileNamePattern.endsWith(".ts"), optional: true }],
			name: "procedures",
			optional: true,
		},
		{
			children: [{ name: fileNamePattern.endsWith(".ts"), optional: true }],
			name: "routes",
			optional: true,
		},
	]

	// `client/` accepts the standard subdirs — no flat files at tier root.
	const clientTierChildren = [
		{ name: "lib", optional: true },
		typesTierEntry,
		{
			children: [{ name: fileNamePattern.useMutation(), optional: true }],
			name: "mutations",
			optional: true,
		},
		{
			children: [{ name: fileNamePattern.nonHookQuery(), optional: true }],
			name: "queries",
			optional: true,
		},
		{
			children: [{ name: fileNamePattern.useHook(), optional: true }],
			name: "hooks",
			optional: true,
		},
		{
			children: [
				{ name: fileNamePattern.pascalCase("Route.tsx"), optional: true },
			],
			name: "routes",
			optional: true,
		},
		{
			children: [
				{
					children: componentFolderChildren,
					name: fileNamePattern.pascalCase(),
					optional: true,
				},
			],
			name: "components",
			optional: true,
		},
	]

	return {
		allowExtraTopLevelEntries: false,
		root: "src",
		structure: [
			{ children: clientTierChildren, name: "client", optional: true },
			{ children: serverTierChildren, name: "server", optional: true },
			{ children: sharedTierChildren, name: "shared", optional: true },
		],
	}
}

/**
 * Naming rules — every file in a structured directory exports exactly one
 * binding named after the filename. Default exports are forbidden everywhere.
 */
const vsaNamingRules = () => [
	// Anything inside any `lib/` (tier-level OR per-component).
	{
		filePattern: "src/**/lib/**/*.ts",
		forbidDefaultExport: true,
		requireFilenameMatchesExport: true,
		requireSingleExport: true,
	},
	// Client subdirs with structured content.
	{
		filePattern: "src/client/{mutations,queries,hooks,routes}/*.{ts,tsx}",
		forbidDefaultExport: true,
		requireFilenameMatchesExport: true,
		requireSingleExport: true,
	},
	// Component-local hooks (inside a component folder) — same one-export shape.
	{
		filePattern: "src/client/components/**/hooks/*.{ts,tsx}",
		forbidDefaultExport: true,
		requireFilenameMatchesExport: true,
		requireSingleExport: true,
	},
	// Every component file at any depth under `components/`.
	{
		filePattern: "src/client/components/**/*.tsx",
		forbidDefaultExport: true,
		requireFilenameMatchesExport: true,
		requireSingleExport: true,
	},
	// Server procedures — flat. Filename pattern itself is flexible
	// (the folder structure allows any `.ts`); the rule enforces the
	// one-export-per-file shape.
	{
		filePattern: "src/server/procedures/*.ts",
		forbidDefaultExport: true,
		requireFilenameMatchesExport: true,
		requireSingleExport: true,
	},
	// Server routes — each file = one named HTTP handler.
	{
		filePattern: "src/server/routes/*.ts",
		forbidDefaultExport: true,
		requireFilenameMatchesExport: true,
		requireSingleExport: true,
	},
	// Server router — single tRPC sub-router per slice, mounted at
	// `server/router.ts`. Must export exactly one named `router` (filename
	// match is enforced by `requireFilenameMatchesExport`).
	{
		filePattern: "src/server/router.ts",
		forbidDefaultExport: true,
		requireFilenameMatchesExport: true,
		requireSingleExport: true,
	},
	// types/ folders — one PascalCase type/interface/enum per file, named
	// after the file. Default exports forbidden.
	{
		allowOnly: ["type", "interface", "enum"] as Array<
			"type" | "interface" | "enum"
		>,
		enum: { case: "PascalCase" as const },
		filePattern: "src/{client,server,shared}/types/*.ts",
		forbidDefaultExport: true,
		interface: { case: "PascalCase" as const },
		requireFilenameMatchesExport: true,
		requireSingleExport: true,
		type: { case: "PascalCase" as const },
	},
]

/**
 * Independent-modules rules generated from path + peers.
 *
 * Within-package tier hierarchy:
 *   routes → components → hooks → {queries, mutations} → lib
 *
 * Cross-tier access to `shared/` is tier-matched, not free:
 *   client/<T> can reach shared/lib  AND  shared/<T>   — nothing else
 *   server/<T> can reach shared/lib  AND  shared/<T>   — nothing else
 *   shared/lib is the universal floor (everyone gets it)
 *
 * The same discipline crosses package boundaries: a peer's `shared/<T>`
 * is reachable only by a consumer at the matching tier.
 */
const vsaIndependentModules = (path: string, peers: string[]) => {
	const me = `${path}/src`

	// shared/lib is the universal toolkit. shared/<tier> is reachable only
	// from the matching tier — so `client/lib` may pull `shared/lib` only,
	// `client/hooks` may pull `shared/lib + shared/hooks`, and so on.
	const sharedFor = (tier: string): string[] =>
		tier === "lib"
			? [`${me}/shared/lib/**`]
			: [`${me}/shared/lib/**`, `${me}/shared/${tier}/**`]

	const peerSharedFor = (tier: string): string[] =>
		peers.flatMap((p) =>
			tier === "lib"
				? [`${p}/src/shared/lib/**`]
				: [`${p}/src/shared/lib/**`, `${p}/src/shared/${tier}/**`]
		)

	// Peer client/server access is tier-matched too: lib only sees peer/lib,
	// procedures see peer/lib + peer/procedures, etc. Peer `shared/lib` is the
	// universal floor (same rule as own `shared/lib`), so it's always included.
	const peerServerFor = (tier: string): string[] => [
		...peerSharedFor("lib"),
		...peers.flatMap((p) =>
			tier === "lib"
				? [`${p}/src/server/lib/**`]
				: [`${p}/src/server/lib/**`, `${p}/src/server/${tier}/**`]
		),
	]
	const peerClientFor = (tier: string): string[] => [
		...peerSharedFor("lib"),
		...peers.flatMap((p) =>
			tier === "lib"
				? [`${p}/src/client/lib/**`]
				: [`${p}/src/client/lib/**`, `${p}/src/client/${tier}/**`]
		),
	]

	// Types-access bundles. Types are pure and erased at compile time, so
	// every tier within a side (client/server) gets to pull from its own
	// types/ folder, shared/types/, and the corresponding peer folders.
	// Shared tiers (and the standalone shared/types rule) get only shared/types.
	const clientTypesAccess = (): string[] => [
		`${me}/client/types/**`,
		`${me}/shared/types/**`,
		...peers.flatMap((p) => [
			`${p}/src/client/types/**`,
			`${p}/src/shared/types/**`,
		]),
	]
	const serverTypesAccess = (): string[] => [
		`${me}/server/types/**`,
		`${me}/shared/types/**`,
		...peers.flatMap((p) => [
			`${p}/src/server/types/**`,
			`${p}/src/shared/types/**`,
		]),
	]
	const sharedTypesAccess = (): string[] => [
		`${me}/shared/types/**`,
		...peers.map((p) => `${p}/src/shared/types/**`),
	]

	const allow = (...lists: string[][]) => [
		...new Set([...lists.flat(), "node_modules/**"]),
	]

	return [
		// --- shared/ ---
		// shared as a whole can never import from client/ or server/.
		{
			allowImportsFrom: allow(
				[`${me}/shared/**`],
				peers.map((p) => `${p}/src/shared/**`)
			),
			denyImportsFrom: [`${me}/client/**`, `${me}/server/**`],
			module: `${me}/shared/**`,
		},
		// shared/lib is a leaf — only itself + shared/types + peer/shared/lib.
		{
			allowImportsFrom: allow(
				[`${me}/shared/lib/**`],
				sharedTypesAccess(),
				peerSharedFor("lib")
			),
			module: `${me}/shared/lib/**`,
		},

		// --- types/ ---
		// Pure type folders. Each types/ file may import:
		//   1. sibling files in the same types/ folder
		//   2. shared/types/ (own slice + peers)
		// Nothing else — types must stay dependency-clean so they can be
		// pulled by any tier without inviting runtime imports along.
		{
			allowImportsFrom: allow(sharedTypesAccess()),
			module: `${me}/shared/types/**`,
		},
		{
			allowImportsFrom: allow(serverTypesAccess()),
			module: `${me}/server/types/**`,
		},
		{
			allowImportsFrom: allow(clientTypesAccess()),
			module: `${me}/client/types/**`,
		},

		// --- server/ ---
		// server/lib: pure helpers, stateful services, middleware — only
		// lib siblings + shared/lib + types/ + peer/server/lib.
		{
			allowImportsFrom: allow(
				sharedFor("lib"),
				[`${me}/server/lib/**`],
				serverTypesAccess(),
				peerServerFor("lib")
			),
			module: `${me}/server/lib/**`,
		},
		// server/procedures: composes lib + shared/{lib,procedures} + types.
		// No procedure→procedure imports — each procedure is independent.
		{
			allowImportsFrom: allow(
				sharedFor("procedures"),
				[`${me}/server/lib/**`],
				serverTypesAccess(),
				peerServerFor("procedures")
			),
			module: `${me}/server/procedures/*.ts`,
		},
		// server/routes: HTTP entry points. Composes lib + procedures +
		// shared/{lib,routes} + types. Routes may invoke procedures directly
		// when tRPC doesn't fit the transport (SSE, file streams, etc.).
		{
			allowImportsFrom: allow(
				sharedFor("routes"),
				[`${me}/server/lib/**`, `${me}/server/procedures/**`],
				serverTypesAccess(),
				peerServerFor("routes")
			),
			module: `${me}/server/routes/*.ts`,
		},
		// server/router.ts: the slice's tRPC sub-router. Composes its own
		// procedures + lib. Stays minimal — it's pure wiring.
		{
			allowImportsFrom: allow(
				sharedFor("lib"),
				[`${me}/server/lib/**`, `${me}/server/procedures/**`],
				serverTypesAccess(),
				peerServerFor("lib")
			),
			module: `${me}/server/router.ts`,
		},

		// --- client/ ---
		// (No tier-root rule: flat files at `client/` are forbidden by the
		// folder-structure rule, so no file ever matches.)

		// LEAVES: lib, queries, mutations.
		// client/lib/*.ts: pure helpers — only shared/lib + lib siblings + types.
		{
			allowImportsFrom: allow(
				sharedFor("lib"),
				[`${me}/client/lib/**`],
				clientTypesAccess(),
				peerClientFor("lib")
			),
			module: `${me}/client/lib/**/*.ts`,
		},
		{
			allowImportsFrom: allow(
				sharedFor("mutations"),
				[`${me}/client/lib/**`],
				clientTypesAccess(),
				peerClientFor("mutations")
			),
			module: `${me}/client/mutations/*.ts`,
		},
		{
			allowImportsFrom: allow(
				sharedFor("queries"),
				[`${me}/client/lib/**`],
				clientTypesAccess(),
				peerClientFor("queries")
			),
			module: `${me}/client/queries/*.ts`,
		},

		// COMPOSERS: hooks, components, routes.
		// hooks: composes data leaves + lib + shared/{lib,hooks} + types.
		{
			allowImportsFrom: allow(
				sharedFor("hooks"),
				[
					`${me}/client/lib/**`,
					`${me}/client/queries/**`,
					`${me}/client/mutations/**`,
				],
				clientTypesAccess(),
				peerClientFor("hooks")
			),
			module: `${me}/client/hooks/*.{ts,tsx}`,
		},
		// Flat component (no nested folder).
		{
			allowImportsFrom: allow(
				sharedFor("components"),
				[
					`${me}/client/lib/**`,
					`${me}/client/mutations/**`,
					`${me}/client/queries/**`,
					`${me}/client/hooks/**`,
				],
				clientTypesAccess(),
				peerClientFor("components")
			),
			module: `${me}/client/components/*.tsx`,
		},
		// Component folder root: flat permissions plus own subtree.
		{
			allowImportsFrom: allow(
				sharedFor("components"),
				[
					`${me}/client/lib/**`,
					`${me}/client/mutations/**`,
					`${me}/client/queries/**`,
					`${me}/client/hooks/**`,
					"{selfModule}/**",
				],
				clientTypesAccess(),
				peerClientFor("components")
			),
			module: `${me}/client/components/*/*.tsx`,
		},
		// Component folder lib: only same-component lib siblings + shared/lib + types.
		{
			allowImportsFrom: allow(
				sharedFor("lib"),
				["{selfModule}/lib/**"],
				clientTypesAccess(),
				peerSharedFor("lib")
			),
			module: `${me}/client/components/*/lib/**`,
		},
		// Component-local hooks: same downward access as global hooks, plus the
		// component's own `lib`. May not reach the component's sub-components.
		{
			allowImportsFrom: allow(
				sharedFor("hooks"),
				[
					`${me}/client/lib/**`,
					`${me}/client/queries/**`,
					`${me}/client/mutations/**`,
					"{selfModule}/lib/**",
				],
				clientTypesAccess(),
				peerClientFor("hooks")
			),
			module: `${me}/client/components/*/hooks/*.{ts,tsx}`,
		},
		// Sub-component (one level deep, under the parent's `components/` dir):
		// same access as a flat component. No `{selfModule}` — it cannot reach
		// sibling sub-components or the parent's internals.
		{
			allowImportsFrom: allow(
				sharedFor("components"),
				[
					`${me}/client/lib/**`,
					`${me}/client/mutations/**`,
					`${me}/client/queries/**`,
					`${me}/client/hooks/**`,
				],
				clientTypesAccess(),
				peerClientFor("components")
			),
			module: `${me}/client/components/*/components/*/*.tsx`,
		},
		// Routes: top of the tree.
		{
			allowImportsFrom: allow(
				sharedFor("routes"),
				[
					`${me}/client/lib/**`,
					`${me}/client/mutations/**`,
					`${me}/client/queries/**`,
					`${me}/client/hooks/**`,
					`${me}/client/components/**`,
				],
				clientTypesAccess(),
				peerClientFor("routes")
			),
			module: `${me}/client/routes/*.tsx`,
		},
	]
}

const STANDARD_IGNORES = [
	"node_modules/**",
	"dist/**",
	"preen.config.ts",
	"**/*.test.{ts,tsx}",
	"**/*.gen.ts",
]

/**
 * Generates a complete preen config for a VSA package.
 *
 * Encodes every convention agreed for the codebase:
 *   • client / server / shared tiers under `src/`
 *   • standard client subdirs (lib, mutations, queries, hooks, components,
 *     routes) with their filename patterns
 *   • component folders only (no flat `components/<Name>.tsx`): each is a
 *     mini-slice — `<Name>.tsx` + optional local `lib/`, local `hooks/`, and a
 *     nested `components/` dir (one level of leaf sub-components). Local
 *     `queries/`/`mutations/` are not allowed — those stay at the client root.
 *   • hierarchy: routes → components → hooks → {queries, mutations} → lib → shared
 *   • cross-package access via the standard tier-matching rule
 *   • single-export-named-after-file in every structured directory
 *   • banned legacy filenames + barrel ban
 *   • test files ignored
 */
export const vsaPackage = (options: VsaPackageOptions): UserConfig => {
	const {
		path,
		peers = [],
		extraIgnorePatterns = [],
		graph,
		overrides = {},
	} = options
	const normalizedPath = path.replace(/[\\/]+$/, "")
	const defaultSliceId = normalizedPath.split(/[\\/]/).pop() ?? normalizedPath

	const base: UserConfig = {
		bannedPatterns: vsaBannedPatterns(),
		folderStructure: vsaFolderStructure(),
		// Top-level toggles — universal across every VSA package.
		forbidRelativeParentImports: false,
		ignorePatterns: [...STANDARD_IGNORES, ...extraIgnorePatterns],
		include: ["src/**/*.{ts,tsx}"],
		graph: { sliceId: graph?.sliceId ?? defaultSliceId },
		independentModules: vsaIndependentModules(path, peers),
		namingRules: vsaNamingRules(),
		requireTestPairing: true,
		tsconfig: "./tsconfig.json",
	}

	return { ...base, ...overrides }
}
