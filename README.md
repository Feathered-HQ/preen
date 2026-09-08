# @feathered/preen

Architecture linter for TypeScript monorepos. Enforces folder shape, filename and export conventions, banned names, and inter-module import boundaries — all defined in TypeScript, no ESLint required.

The lower-level primitives work in any repo. Codebases following full-stack Vertical Slice Architecture (`client`/`server`/`shared` tiers, no barrel files) can use the `vsaPackage()` preset to get the whole rule set in three lines.

> [!WARNING]
> **Work in progress.** preen is pre-1.0 and moves fast. It was extracted from a
> private monorepo, is not published to any registry yet, and has no test suite.
> Rule identifiers, the config schema, and CLI output may all change without a
> deprecation path. Pin a tag if you depend on it.

---

## What it enforces

Each package gets a `preen.config.ts` that declares one or more of four kinds of rule. Every check is independent — you can use some and skip others.

| Checker | What it catches |
|---|---|
| **Folder structure** | Disallowed sub-directories, missing required files (e.g. `Drawer/Drawer.tsx`), wrong filename patterns. |
| **Naming rules** | "One export per file", "filename matches export", filename suffix/prefix conventions, allowed export kinds (only types vs only functions, etc.). |
| **Banned patterns** | Forbidden filenames or folders (`utils.ts`, `helpers/`, `index.tsx` barrels, etc.). |
| **Independent modules** | Cross-folder and cross-package import boundaries. The slice-isolation rules, the data-flow hierarchy, the no-cross-tier rule — all expressed here. |

The tool parses TS/TSX with `oxc-parser` (fast, correct), resolves imports with `oxc-resolver` (respects `tsconfig`, `package.json` `exports` map, workspace symlinks), and matches paths with `picomatch` (full glob syntax).

---

## Quick start — VSA preset

For any package that follows the VSA conventions above, the config is three lines:

```ts
// <package>/preen.config.ts
import { vsaPackage } from "@feathered/preen"

export default vsaPackage({
	path: "slices/mcp",   // workspace-relative path to this package
	peers: ["common"],    // other packages this one may import from
})
```

That single call generates:

- The `src/{client,server,shared}` folder shape
- The standard client subdirs (`lib/`, `mutations/`, `queries/`, `hooks/`, `routes/`, `components/`) with their filename patterns
- Component folders + sub-components (`Drawer/Drawer.tsx`, optional `Drawer/lib/`, one level of sub-component folders)
- The dependency hierarchy (`routes → components → hooks → {queries,mutations} → lib → shared`)
- Single-export-named-after-file rules for every structured directory
- Cross-package access rules (peer's `shared/` is universal, peer's `server/` is server-only, peer's `client/` is restricted per tier)
- Banned filenames (`utils.ts`, `helpers.ts`, `index.tsx`, etc.) and barrel ban
- Test files (`*.test.{ts,tsx}`) ignored everywhere

If you need to customize, `extraIgnorePatterns` and `overrides` are escape hatches:

```ts
vsaPackage({
	path: "common",
	extraIgnorePatterns: ["src/shared/supabaseGenerated.ts"],
	overrides: { /* replaces sections of the generated config */ },
})
```

---

## CLI commands

Not yet published to a registry. Consume it as a git dependency:

```jsonc
// package.json
"devDependencies": {
  "@feathered/preen": "github:Feathered-HQ/preen#v0.1.0"
}
```

All commands resolve config and `tsconfig.json` from the current working directory by default.

```bash
preen check                     # run all four checkers
preen validate                  # self-consistency check on the config alone
preen explain <file>            # show which rules apply to a given file
preen visualize rules           # emit configured import rules as Mermaid
preen graph                     # emit observed source dependencies as Mermaid
preen snapshot                  # update the committed dependency snapshot
```

Common flags:

| Flag | Purpose |
|---|---|
| `--cwd <path>` | run as if from a different directory |
| `--config <path>` | explicit config file path (default: `./preen.config.ts`) |
| `--json` | machine-readable output (CI / GitHub Actions annotations / SARIF later) |
| `--no-color` | disable ANSI colors |
| `--max-warnings <n>` | treat as failure when warnings exceed `n` |
| `--output <path>` | write graph or snapshot output to a file |
| `--scope <value>` | graph `all`, one `slice:<id>`, or a repository-relative `path:<directory>` |
| `--granularity <value>` | render `slice` or `file` nodes |
| `--after-depth <n\|all>` | outgoing dependency levels to include (default: `all`) |
| `--behind-depth <n\|all>` | incoming dependent levels to include (default: `0`) |
| `--format <value>` | graph output as `mermaid`, `markdown`, `json`, or `text` |
| `--help`, `-h` | help text |

Exit codes:
- `0` — clean
- `1` — errors (or warnings beyond `--max-warnings`)
- `2` — internal error (config not found, parse failure, etc.)

### `check` — the main command

Runs all four checkers and reports diagnostics:

```bash
$ preen check
src/client/queries/useThingsQuery.ts
  error unexpected file "useThingsQuery.ts" (folder-structure/disallowed-entry)

src/client/hooks/useBad.ts
  error:1:24 import of "./useFoo" (resolved to slices/mcp/src/client/hooks/useFoo.ts)
  is not in the allowlist for module "slices/mcp/src/client/hooks/*.{ts,tsx}"
  (independent-modules/import-not-allowed)

preen: 2 errors
scanned 21 files in 51ms (config: preen.config.ts)
```

Every diagnostic has a `ruleId` (in parentheses) you can grep for to find why it fired.

### `validate` — config self-check

Runs **without** scanning any source files. Catches typos and dead rules in the config itself:

```bash
$ preen validate
error: folderStructure references undefined ruleId "componnetFolder"
warning: folderStructure.rules.unusedRule is declared but never referenced
error: independentModules rule for "src/server/**" has empty allowImportsFrom
       — nothing will be importable

config: 2 error(s), 1 warning(s)
```

Useful as a fast pre-commit hook or before opening a PR that touches the config.

### `explain <file>` — debug why a rule did or didn't fire

```bash
$ preen explain src/server/createMcpServer.ts
File: src/server/createMcpServer.ts

Naming rules:
  pattern: src/{client,server,shared}/*.{ts,tsx}
    • requireSingleExport
    • requireFilenameMatchesExport

Import rules:
  module: slices/mcp/src/server/*.{ts,tsx}
    allowImportsFrom:
      ✓ slices/mcp/src/shared/**
      ✓ slices/mcp/src/server/lib/**
      ✓ common/src/server/**
      ✓ common/src/shared/**
      ✓ node_modules/**
```

Reports the rules that *would* apply — not whether the file currently passes them. Combine with `check` for the full picture.

If the file is in `ignorePatterns`, you'll see:

```bash
$ preen explain src/server/foo.test.ts
File: src/server/foo.test.ts
  ignored — matches **/*.test.{ts,tsx}
```

### `visualize rules` — visualize configured boundaries

```bash
$ preen visualize rules > docs/architecture/import-rules.mmd
```

This is the former `preen graph` behavior. It renders the intended
`independentModules` relationships from configuration; it does not scan imports.

### Dependency graphs and snapshots

Create a workspace manifest at the repository root. Explicit project patterns
keep fixtures and unrelated packages out of the graph:

```ts
// preen.workspace.ts
import { defineWorkspace } from "@feathered/preen"

export default defineWorkspace({
	projects: ["common/preen.config.ts", "slices/*/preen.config.ts"],
	graph: {
		snapshot: ".preen/dependency-graph.snapshot.json",
	},
})
```

`vsaPackage({ path: "slices/mcp" })` uses `mcp` as its graph slice ID. It can
be overridden when the directory name is not the desired stable identity:

```ts
vsaPackage({
	path: "slices/mcp",
	graph: { sliceId: "model-context-protocol" },
})
```

Generate the deterministic, repository-relative JSON snapshot and commit it:

```bash
preen snapshot
preen snapshot --check   # exits 1 when source and snapshot differ
```

Render the whole workspace as one node per slice, or inspect files in one slice:

```bash
preen graph --scope all --granularity slice
preen graph --scope slice:mcp --granularity file
preen graph --scope path:slices/mcp/src/client --granularity file
preen graph --format markdown > docs/architecture/dependencies.md
```

Focused graphs traverse every outgoing dependency by default and omit incoming
dependents. Control both directions independently:

```bash
preen graph \
	--scope path:slices/mcp/src/client/components \
	--granularity file \
	--after-depth 3 \
	--behind-depth 1
```

Depth `0` retains only the selected scope, a positive integer includes that many
relationship levels, and `all` follows the complete reachable graph. At file
granularity, reached files remain individual nodes even when they belong to
another slice. At slice granularity, traversal operates on aggregated slices.
Markdown output includes graph size, density, cycles, fan-in/fan-out hotspots,
and a Mermaid diagram.

Compare the committed snapshot with live source, or compare two stored snapshots:

```bash
preen graph diff \
	--base .preen/dependency-graph.snapshot.json \
	--scope slice:mcp \
	--granularity file \
	--format markdown

preen graph diff --base base.json --head head.json --granularity slice
```

Added nodes and edges render green; removed nodes and edges render red and
dashed. Unchanged context remains grey. Ordinary graph changes exit successfully.
Selected regressions can fail a build:

```bash
preen graph diff \
	--base base.json \
	--head head.json \
	--fail-on new-cycles,new-unresolved-imports
```

The snapshot always stores the full file graph. Scope and granularity are applied
when rendering, so one snapshot supports whole-workspace, slice-level, and
file-level views and diffs. Mermaid output can be rendered by GitHub Markdown,
mermaid.live, or editor extensions.

---

## Configuration without the preset

If your package doesn't fit VSA — or you want full control — use `defineConfig()` directly. The preset compiles down to this; everything it does, you can do by hand.

```ts
import { defineConfig, fileNamePattern } from "@feathered/preen"

export default defineConfig({
	include: ["src/**/*.{ts,tsx}"],
	ignorePatterns: ["node_modules/**", "dist/**"],
	tsconfig: "./tsconfig.json",

	bannedPatterns: [
		{ pattern: "**/utils.ts", reason: "use one-export-per-file" },
	],

	folderStructure: {
		root: "src",
		allowExtraTopLevelEntries: false,
		structure: [
			{ name: "components", optional: true, children: [
				{ name: fileNamePattern.pascalCase(".tsx"), optional: true },
			]},
		],
	},

	namingRules: [
		{
			filePattern: "src/components/*.tsx",
			requireSingleExport: true,
			requireFilenameMatchesExport: true,
		},
	],

	independentModules: [
		{
			module: "my-package/src/components/**",
			allowImportsFrom: ["my-package/src/shared/**", "node_modules/**"],
		},
	],
})
```

### Folder structure

`folderStructure` walks the file tree starting at `root` (relative to `cwd`). Each entry in `structure` declares one allowed child of `root`. Each entry can have its own `children` (recursive — defines what's allowed inside that folder).

```ts
folderStructure: {
	root: "src",
	allowExtraTopLevelEntries: false,   // unmatched entries at root → error
	structure: [
		{
			name: "components",                // literal name OR pattern
			optional: true,                    // not required to exist
			children: [
				{ name: fileNamePattern.pascalCase(".tsx"), optional: true },
				{ name: "lib", optional: true },
			],
		},
	],
}
```

**Name patterns:**
- Literal string: `name: "lib"` — exact match
- Case style: `name: { case: "PascalCase" }`
- Regex: `name: { regex: "^use.+\\.ts$" }`
- Token interpolation: `name: "{folderName}.tsx"` — expands to `<currentDirectoryName>.tsx`. Lets you say "every PascalCase folder must contain a file with its own name".

**Helpers (recommended over raw regex):**
- `fileNamePattern.pascalCase(suffix?)` → `^[A-Z][A-Za-z0-9]*<suffix>$`
- `fileNamePattern.camelCase(suffix?)` → `^[a-z][A-Za-z0-9]*<suffix>$`
- `fileNamePattern.startsWith(prefix, suffix)` → `^<prefix>.+<suffix>$`
- `fileNamePattern.endsWith(suffix)` → `.+<suffix>$`
- `fileNamePattern.notStartingWith(prefix, { followedByUppercase?, suffix })` → negative lookahead
- `fileNamePattern.raw(regex)` → escape hatch
- Pre-baked: `fileNamePattern.useMutation()`, `useHook()`, `nonHookQuery()`

**Rule reuse** — for TypeScript configs, share `children` arrays with plain JS variables. The legacy `ruleId` mechanism still works but is no longer recommended (no type safety, no IDE go-to-definition).

```ts
const tierChildren = [
	{ name: "lib", optional: true },
	{ name: fileNamePattern.endsWith(".ts"), optional: true },
]

structure: [
	{ name: "server", optional: true, children: tierChildren },
	{ name: "shared", optional: true, children: tierChildren },  // shared by reference
]
```

### Naming rules

Each rule applies to files matching `filePattern` (a picomatch glob) and asserts properties about the file's exports.

```ts
namingRules: [
	{
		filePattern: "src/**/lib/**/*.{ts,tsx}",
		requireSingleExport: true,              // exactly one distinct binding name
		requireFilenameMatchesExport: true,     // that name matches the filename stem
	},
	{
		filePattern: "src/**/*.consts.ts",
		allowOnly: ["variable"],                // only `const` exports allowed
		variable: { case: "CONSTANT_CASE" },    // names must be SCREAMING_SNAKE
	},
	{
		filePattern: "src/**/*.types.ts",
		allowOnly: ["type", "interface", "enum"],
		type: { case: "PascalCase" },
		interface: { case: "PascalCase" },
		enum: { case: "PascalCase" },
	},
]
```

**Available constraints per rule:**
- `requireSingleExport: true` — exactly one distinct exported name
- `requireFilenameMatchesExport: true` — one of the exports must match the filename stem
- `allowOnly: ("variable" | "function" | "class" | "type" | "interface" | "enum")[]` — restrict export kinds
- Per-kind constraints (`variable`, `function`, `class`, `type`, `interface`, `enum`) each take `{ case?, regex?, prefix?, suffix? }`

`export type Foo = ...` + `export const Foo = ...` count as **one** distinct name. Zod schemas exporting both `const fooSchema = z.object(...)` and `type Foo = z.infer<...>` count as **two**.

### Banned patterns

Glob-based path denylist. Catches things the folder structure or naming rule might miss, especially at the tier root.

```ts
bannedPatterns: [
	{ pattern: "**/utils.ts", reason: "use one-export-per-file" },
	{ pattern: "**/utils/**", reason: "`utils/` is banned as a folder name" },
	{ pattern: "**/index.{ts,tsx}", reason: "barrels are banned — use `exports` map" },
]
```

`reason` is shown in the error message.

### Independent modules

The most powerful checker. Declares "files matching `module` may import from `allowImportsFrom` and not from `denyImportsFrom`".

```ts
independentModules: [
	{
		module: "common/src/shared/**",
		allowImportsFrom: ["common/src/shared/**", "node_modules/**"],
		denyImportsFrom: ["common/src/client/**", "common/src/server/**"],
	},
]
```

**How patterns are matched:**
- `module` and `allowImportsFrom` / `denyImportsFrom` patterns are **workspace-relative**, not cwd-relative. The tool detects the workspace root by walking up from `cwd` looking for a `pnpm-workspace.yaml`.
- Multiple rules can match the same file. The file's imports must satisfy **all** matching rules (intersection).
- `node_modules/**` matches any path containing `/node_modules/`. Use this to allow external deps.

**Token captures:**
- `{selfModule}` resolves to the file's matched module root. For pattern `common/src/components/*/**` against file `common/src/components/Drawer/Drawer.tsx`, `{selfModule}` = `common/src/components/Drawer`.
- `{moduleName}` resolves to just the wildcard-captured segment (`Drawer` in the example).

Use `{selfModule}` to express "this file may import from its own subtree" — e.g. component folder roots accessing their own `lib/` and sub-components.

```ts
{
	module: "common/src/client/components/*/*.tsx",
	allowImportsFrom: [
		"common/src/shared/**",
		"{selfModule}/**",        // own subtree only — not other components
		"node_modules/**",
	],
}
```

**Sibling bans** — by omission. A rule like:

```ts
{
	module: "common/src/client/queries/*.ts",
	allowImportsFrom: ["common/src/client/lib/**", "common/src/shared/**", "node_modules/**"],
}
```

…does **not** include `common/src/client/queries/**` in the allowlist, so a query importing a sibling query fires `import-not-allowed`.

---

## Project layout

```
preen/
├── bin/
│   └── preen.mjs       # CLI entry shim — calls runCli
├── src/
│   ├── cli.ts                      # argv parsing + subcommand dispatch
│   ├── define-config.ts            # the defineConfig() helper
│   ├── index.ts                    # public API barrel for consumers
│   ├── run-checks.ts               # orchestrates all four checkers
│   ├── config/
│   │   ├── case-style.ts           # PascalCase / camelCase / snake_case regex utilities
│   │   ├── config-schema.ts        # Zod schema — the source of truth for valid config
│   │   ├── find-workspace-root.ts  # walks up looking for pnpm-workspace.yaml
│   │   ├── load-config.ts          # resolves and imports the config file
│   │   └── pattern/
│   │       ├── module-pattern.ts   # workspace-relative module matching + {selfModule}
│   │       └── name-pattern.ts     # name regex compilation including {folderName} tokens
│   ├── checkers/
│   │   ├── banned-patterns/        # glob-based path denylist
│   │   ├── folder-structure/       # recursive tree walker
│   │   ├── naming-rules/           # AST-based top-level declaration analyzer
│   │   ├── independent-modules/    # cross-file import resolution + allow/deny check
│   │   ├── explain/                # rule-applicability inspector for `explain` CLI
│   │   └── validate/               # config self-consistency for `validate` CLI
│   ├── diagnostics/
│   │   ├── diagnostic.ts           # Diagnostic shape + severity types
│   │   └── format-diagnostics.ts   # human-readable text formatter
│   ├── dsl/
│   │   └── fileNamePattern.ts      # the filename-pattern helpers
│   └── presets/
│       └── vsaPackage.ts           # the VSA preset — generates a full config from path+peers
└── tests/
```

Each checker is independent — they receive the parsed config and a pre-filtered file list, return `Diagnostic[]`. Adding a new checker means dropping a folder under `src/checkers/`, calling it from `run-checks.ts`, and adding any new `ruleId` literals to `src/diagnostics/diagnostic.ts`.

---

## Programmatic API

For tests, CI scripts, or custom dashboards:

```ts
import {
	defineConfig,
	loadConfig,
	runChecks,
	validateConfig,
	explainFile,
} from "@feathered/preen"

const { config } = await loadConfig(process.cwd())
const result = await runChecks({ cwd: process.cwd(), config })
console.log(`${result.diagnostics.length} issues across ${result.scannedFileCount} files`)
```

Exported symbols:

| Name | Purpose |
|---|---|
| `defineConfig(config)` | type-narrowing identity function for the user config |
| `vsaPackage(options)` | the VSA preset |
| `loadConfig(cwd, configPath?)` | resolves the config file and parses it |
| `runChecks({ cwd, config })` | run all four checkers, return diagnostics |
| `validateConfig(config)` | self-consistency check |
| `explainFile(cwd, config, filePath)` | which rules apply to a file |
| `formatDiagnostics`, `formatExplainResult`, `formatValidationIssues` | text formatters used by the CLI |
| `fileNamePattern` | the filename-pattern DSL |
| `runCli(argv)` | the CLI itself, exported for programmatic invocation |

Types: `UserConfig`, `ProjectStructureConfig`, `FolderStructureConfig`, `NamingRule`, `IndependentModuleRule`, `Diagnostic`, `DiagnosticSeverity`, `ExplainFileResult`, `ConfigValidationIssue`.

---

## Diagnostic IDs

Every diagnostic carries a `ruleId` you can grep for and silence selectively. Current set:

| Rule ID | Source | Meaning |
|---|---|---|
| `folder-structure/disallowed-entry` | folder structure | a file or directory exists that's not allowed by the schema |
| `folder-structure/missing-required` | folder structure | a required entry (non-optional, no token in the name) is missing |
| `folder-structure/name-mismatch` | folder structure | reserved — not currently emitted |
| `folder-structure/unknown-rule-id` | folder structure | an entry references a `ruleId` that's not in `rules` |
| `banned-pattern/match` | banned patterns | a file path matches a banned glob |
| `naming-rules/disallowed-export-kind` | naming rules | a file exports something not in `allowOnly` (e.g. a const in a `.types.ts` file) |
| `naming-rules/case-mismatch` | naming rules | an export name doesn't match the configured case |
| `naming-rules/regex-mismatch` | naming rules | an export name doesn't match the configured regex |
| `naming-rules/prefix-mismatch` | naming rules | an export name doesn't start with the configured prefix |
| `naming-rules/suffix-mismatch` | naming rules | an export name doesn't end with the configured suffix |
| `naming-rules/filename-mismatch` | naming rules | `requireFilenameMatchesExport` failed — no export matches the filename stem |
| `naming-rules/multiple-exports` | naming rules | `requireSingleExport` failed — more than one distinct binding name |
| `independent-modules/import-not-allowed` | independent modules | resolved import not in the rule's `allowImportsFrom` |
| `independent-modules/import-explicitly-denied` | independent modules | resolved import matches a `denyImportsFrom` pattern |
| `independent-modules/unresolvable-import` | independent modules | a relative / absolute import doesn't resolve to a real file |
| `config/parse-error` | any checker | a source file failed to parse (syntax error in source) |

---

## CI integration

The simplest integration is one task per package via Moon:

```yaml
# common/moon.yml or slices/<name>/moon.yml
tasks:
  check-structure:
    command: preen check
    inputs:
      - "**/*.ts"
      - "**/*.tsx"
      - preen.config.ts
      - tsconfig.json
```

`moon ci --summary` then runs `check-structure` across every package in the graph. GitHub Actions can wrap that in a workflow step.

For JSON output (e.g. SARIF or GitHub annotations), use `--json`:

```bash
preen check --json > preen.report.json
```

The output is `{ configPath, scannedFileCount, durationMs, diagnostics: Diagnostic[] }`.

---

## When NOT to use this tool

- **Greenfield projects** where you don't yet know your feature boundaries. VSA boundaries are hard to design up-front — see the VSA guidebook. Use a flat semantic split (`components/`, `hooks/`, etc.) and obsess over dependency direction; slices will emerge.
- **Tiny apps** where folder structure is obvious by inspection. Two folders and ten files don't need a linter.
- **Library code with a single export** (e.g. an npm package exporting one function). The folder structure rules are designed for app-scale codebases.

For everything else — mature monorepos with clear feature boundaries, multi-team codebases needing enforced architecture, projects collapsing under their own dependency graph — this is the kind of tool you'll wish you'd added sooner.

---

## Versioning

No semver guarantees before 1.0. The `defineConfig` / `vsaPackage` API is intended to be stable; the underlying schema may evolve.

To pin behaviour, depend on a specific tag or git SHA:

```jsonc
"@feathered/preen": "github:Feathered-HQ/preen#v0.1.0"
```

---

## Prior art and similar tools

preen is not a new idea. The design owes most to
[eslint-plugin-project-structure](https://github.com/Igorkowalski94/eslint-plugin-project-structure)
by Igor Kowalski — the config vocabulary here (`folderStructure`,
`independentModules`, `allowImportsFrom`, per-rule `ruleId`s, the name rules) is
modelled directly on it. If you already run ESLint and want these checks inside
it, use that plugin: it is mature, documented, and does not ask you to adopt
another binary. preen's one structural difference is that it ships its own
parser and resolver, so it runs without an ESLint config, an ESLint version, or
a flat-config migration.

The rest of the space splits in two.

**Architecture-specific linters** encode one methodology and check adherence to
it. [Steiger](https://github.com/feature-sliced/steiger) is the closest tool to
preen in spirit — a standalone structure linter with 20+ built-in rules, watch
mode, and near-zero config — but it enforces
[Feature-Sliced Design](https://feature-sliced.design) specifically, with fixed
layers (`app → pages → widgets → features → entities → shared`). The two are not
interchangeable: FSD **requires** `index.ts` public-API barrels at every slice
root, which is exactly what the `vsaPackage()` preset bans (the public API here
is the `package.json` `exports` map). Steiger is also single-root, where preen
resolves across workspace packages. If you are doing FSD, or your codebase
drifts that way, use Steiger instead.

**Boundary and dependency tools** answer "may this file import that one?" and
leave folder shape and naming alone:

| Tool | Approach |
|---|---|
| [Sheriff](https://github.com/softarc-consulting/sheriff) | Module boundaries via tags and dependency rules, with an ESLint plugin |
| [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | Element types and hierarchy, as ESLint rules |
| [good-fences](https://github.com/smikula/good-fences) | Per-directory "fence" files declaring what may cross |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | Rules over the whole dependency graph, plus real visualisation |

Any of these enforces import boundaries well, and dependency-cruiser's graph
output is considerably better than preen's Mermaid dump. What none of them do is
the other half — folder shape, one-export-per-file, filename-matches-export,
banned filenames — which is the half that decays fastest when nothing is
checking it.

preen exists because that combination, in one config, across workspace packages,
without a barrel requirement, wasn't available off the shelf. If your
constraints differ on any of those axes, one of the tools above is probably the
better choice.

---

## License

MIT — see [LICENSE](LICENSE).
