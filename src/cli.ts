import path from "node:path"
import fs from "node:fs"
import { parseArgs } from "node:util"
import kleur from "kleur"
import {
	explainFile,
	formatExplainResult,
} from "./checkers/explain/explainFile.js"
import { formatShowConfig } from "./checkers/show/showConfig.js"
import {
	formatValidationIssues,
	validateConfig,
} from "./checkers/validate/validateConfig.js"
import { loadConfig } from "./config/load-config.js"
import { formatDiagnostics } from "./diagnostics/format-diagnostics.js"
import { runChecks } from "./run-checks.js"
import {
	buildDependencyGraph,
	analyzeGraphHealth,
	diffProjectedGraphs,
	parseSnapshot,
	projectGraph,
	renderGraphDiffMermaid,
	renderGraphMermaid,
	serializeSnapshot,
	type GraphProjectionOptions,
	type ProjectedGraphDiff,
	type ProjectedGraph,
	type DependencyGraph,
} from "./graph/index.js"
import { loadWorkspace } from "./workspace/index.js"

type CliFlags = {
	cwd?: string
	config?: string
	json?: boolean
	noColor?: boolean
	maxWarnings?: number
	output?: string
	snapshot?: string
	base?: string
	head?: string
	format?: string
	scope?: string
	granularity?: string
	check?: boolean
	failOn?: string
	afterDepth?: string
	behindDepth?: string
}

const HELP_TEXT = `\
preen — architecture linter for TypeScript monorepos

Usage:
  preen check                    run all checks against the config
  preen validate                 self-consistency check on the config alone
  preen explain <file>           show which rules apply to a file
  preen show                     pretty-print the resolved config as a visual guide
  preen visualize rules          print configured import rules (Mermaid)
  preen graph [diff]             print observed dependencies or a diff
  preen snapshot                 update the dependency snapshot

Options:
  --cwd <path>          working directory (default: process.cwd())
  --config <path>       explicit path to config file
  --json                emit machine-readable JSON instead of pretty output
  --no-color            disable ANSI colors
  --max-warnings <n>    treat as failure if warnings exceed this number
  --output <path>       write output to a file
  --snapshot <path>     render an existing dependency snapshot
  --base <path>         base snapshot for graph diff
  --head <path>         head snapshot for graph diff (default: live source)
  --scope <value>       all, slice:<id>, or path:<directory> (default: all)
  --granularity <value> file or slice (default: slice)
  --after-depth <n|all> outgoing dependency depth (default: all)
  --behind-depth <n|all> incoming dependent depth (default: 0)
  --format <value>      mermaid, json, markdown, or text
  --check               verify the configured snapshot without writing
  --help, -h            show this help

Exit codes:
  0  no issues
  1  errors (or warnings beyond --max-warnings)
  2  internal error
`

const parseCliFlags = (
	argv: string[],
): { command: string; positional: string[]; flags: CliFlags } => {
	const normalizedArgv: string[] = []
	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index]!
		const next = argv[index + 1]
		if (
			(value === "--after-depth" || value === "--behind-depth") &&
			next !== undefined &&
			/^-\d/.test(next)
		) {
			normalizedArgv.push(`${value}=${next}`)
			index += 1
		} else {
			normalizedArgv.push(value)
		}
	}
	const command =
		normalizedArgv[0] === undefined || normalizedArgv[0].startsWith("--")
			? "check"
			: normalizedArgv[0]
	const remaining =
		command === normalizedArgv[0] ? normalizedArgv.slice(1) : normalizedArgv
	const { values, positionals } = parseArgs({
		args: remaining,
		options: {
			cwd: { type: "string" },
			config: { type: "string" },
			json: { type: "boolean", default: false },
			"no-color": { type: "boolean", default: false },
			"max-warnings": { type: "string" },
			output: { type: "string" },
			snapshot: { type: "string" },
			base: { type: "string" },
			head: { type: "string" },
			format: { type: "string" },
			scope: { type: "string" },
			granularity: { type: "string" },
			check: { type: "boolean", default: false },
			"fail-on": { type: "string" },
			"after-depth": { type: "string" },
			"behind-depth": { type: "string" },
			help: { type: "boolean", short: "h", default: false },
		},
		allowPositionals: true,
		strict: true,
	})
	if (values.help === true) {
		return { command: "help", positional: [], flags: {} }
	}
	const flags: CliFlags = {}
	if (typeof values.cwd === "string") flags.cwd = values.cwd
	if (typeof values.config === "string") flags.config = values.config
	if (values.json === true) flags.json = true
	if (values["no-color"] === true) flags.noColor = true
	if (typeof values["max-warnings"] === "string") {
		const parsed = Number(values["max-warnings"])
		if (Number.isFinite(parsed)) flags.maxWarnings = parsed
	}
	if (typeof values.output === "string") flags.output = values.output
	if (typeof values.snapshot === "string") flags.snapshot = values.snapshot
	if (typeof values.base === "string") flags.base = values.base
	if (typeof values.head === "string") flags.head = values.head
	if (typeof values.format === "string") flags.format = values.format
	if (typeof values.scope === "string") flags.scope = values.scope
	if (typeof values.granularity === "string") flags.granularity = values.granularity
	if (values.check === true) flags.check = true
	if (typeof values["fail-on"] === "string") flags.failOn = values["fail-on"]
	if (typeof values["after-depth"] === "string") flags.afterDepth = values["after-depth"]
	if (typeof values["behind-depth"] === "string") flags.behindDepth = values["behind-depth"]
	return { command, positional: positionals, flags }
}

const generateRulesMermaid = (config: {
	independentModules: { module: string; allowImportsFrom: string[] }[]
}): string => {
	const lines: string[] = ["flowchart LR"]
	const nodes = new Set<string>()
	const sanitize = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_")
	for (const rule of config.independentModules) {
		const fromId = sanitize(rule.module)
		nodes.add(`${fromId}["${rule.module}"]`)
		for (const target of rule.allowImportsFrom) {
			if (target === "node_modules/**") continue
			if (target.includes("{selfModule}")) continue
			const toId = sanitize(target)
			nodes.add(`${toId}["${target}"]`)
			lines.push(`  ${fromId} --> ${toId}`)
		}
	}
	return [...lines, ...[...nodes].map((node) => `  ${node}`)].join("\n")
}

const resolveFrom = (cwd: string, value: string): string =>
	path.isAbsolute(value) ? value : path.resolve(cwd, value)

const projectionOptions = (flags: CliFlags): GraphProjectionOptions => {
	const granularity = flags.granularity ?? "slice"
	if (granularity !== "file" && granularity !== "slice") {
		throw new Error(`invalid graph granularity: ${granularity}`)
	}
	const scopeValue = flags.scope ?? "all"
	let scope: GraphProjectionOptions["scope"] | null = scopeValue === "all"
		? ({ type: "all" } as const)
		: scopeValue.startsWith("slice:") && scopeValue.length > 6
			? ({ type: "slice", id: scopeValue.slice(6) } as const)
			: null
	if (scopeValue.startsWith("path:")) {
		const rawPath = scopeValue.slice(5).replaceAll("\\", "/")
		const normalizedPath = rawPath.replace(/^\.\//, "").replace(/\/$/, "")
		const segments = normalizedPath.split("/")
		if (
			normalizedPath.length === 0 ||
			normalizedPath.startsWith("/") ||
			/^[A-Za-z]:/.test(normalizedPath) ||
			segments.includes("..")
		) {
			throw new Error(`path scope must be repository-relative: ${rawPath}`)
		}
		scope = { type: "path", path: normalizedPath }
	}
	if (scope === null) throw new Error(`invalid graph scope: ${scopeValue}`)
	const parseDepth = (
		value: string | undefined,
		name: "after" | "behind",
		defaultValue: number | "all",
	): number | "all" => {
		if (value === undefined) return defaultValue
		if (value === "all") return "all"
		if (!/^\d+$/.test(value)) throw new Error(`invalid ${name} depth: ${value}`)
		const parsed = Number(value)
		if (!Number.isSafeInteger(parsed)) throw new Error(`invalid ${name} depth: ${value}`)
		return parsed
	}
	return {
		scope,
		granularity,
		afterDepth: parseDepth(flags.afterDepth, "after", "all"),
		behindDepth: parseDepth(flags.behindDepth, "behind", 0),
	}
}

const graphContainsScope = (
	graphs: DependencyGraph[],
	scope: GraphProjectionOptions["scope"],
): boolean => {
	if (scope.type === "all") return true
	if (scope.type === "slice") {
		return graphs.some((graph) => graph.files.some((file) => file.slice === scope.id))
	}
	return graphs.some((graph) =>
		graph.files.some(
			(file) => file.id === scope.path || file.id.startsWith(`${scope.path}/`),
		),
	)
}

const assertGraphContainsScope = (
	graphs: DependencyGraph[],
	scope: GraphProjectionOptions["scope"],
): void => {
	if (graphContainsScope(graphs, scope)) return
	const label = scope.type === "slice" ? `slice:${scope.id}` : scope.type === "path" ? scope.path : "all"
	throw new Error(`graph scope contains no configured files: ${label}`)
}

const readSnapshot = (cwd: string, filePath: string) =>
	parseSnapshot(fs.readFileSync(resolveFrom(cwd, filePath), "utf8"))

const writeResult = (cwd: string, output: string | undefined, value: string): void => {
	if (output === undefined) {
		process.stdout.write(`${value}${value.endsWith("\n") ? "" : "\n"}`)
		return
	}
	const target = resolveFrom(cwd, output)
	fs.mkdirSync(path.dirname(target), { recursive: true })
	fs.writeFileSync(target, value.endsWith("\n") ? value : `${value}\n`)
}

const renderDiffText = (diff: ProjectedGraphDiff): string => {
	const addedNodes = diff.nodes.filter((node) => node.status === "added")
	const removedNodes = diff.nodes.filter((node) => node.status === "removed")
	const addedEdges = diff.edges.filter((edge) => edge.status === "added")
	const removedEdges = diff.edges.filter((edge) => edge.status === "removed")
	const lines = [
		`Dependency graph diff: +${addedNodes.length} -${removedNodes.length} nodes, +${addedEdges.length} -${removedEdges.length} edges`,
	]
	for (const node of addedNodes) lines.push(`+ ${node.id}`)
	for (const node of removedNodes) lines.push(`- ${node.id}`)
	for (const edge of addedEdges) lines.push(`+ ${edge.from} -> ${edge.to}`)
	for (const edge of removedEdges) lines.push(`- ${edge.from} -> ${edge.to}`)
	return lines.join("\n")
}

const renderDiff = (diff: ProjectedGraphDiff, format: string): string => {
	if (format === "json") return JSON.stringify(diff, null, 2)
	if (format === "text") return renderDiffText(diff)
	const mermaid = renderGraphDiffMermaid(diff)
	if (format === "mermaid") return mermaid
	if (format === "markdown") {
		return `${renderDiffText(diff)}\n\n\`\`\`mermaid\n${mermaid}\n\`\`\``
	}
	throw new Error(`invalid graph format: ${format}`)
}

const renderGraphReport = (graph: ProjectedGraph, format: "markdown" | "text"): string => {
	const health = analyzeGraphHealth(graph)
	const cycles = health.cycles.length === 0
		? "None"
		: health.cycles.map((cycle) => cycle.join(" → ")).join("; ")
	if (format === "text") {
		return [
			`Nodes: ${health.nodeCount}`,
			`Dependencies: ${health.edgeCount}`,
			`Cycles: ${health.cycles.length}`,
			`Highest fan-in: ${health.highestFanIn?.id ?? "none"} (${health.highestFanIn?.count ?? 0})`,
			`Highest fan-out: ${health.highestFanOut?.id ?? "none"} (${health.highestFanOut?.count ?? 0})`,
			`Cycle members: ${cycles}`,
		].join("\n")
	}
	return [
		"# Dependency graph",
		"",
		"| Metric | Value |",
		"| --- | ---: |",
		`| Nodes | ${health.nodeCount} |`,
		`| Dependencies | ${health.edgeCount} |`,
		`| Cycles | ${health.cycles.length} |`,
		`| Density | ${health.density.toFixed(4)} |`,
		`| Highest fan-in | ${health.highestFanIn?.id ?? "none"} (${health.highestFanIn?.count ?? 0}) |`,
		`| Highest fan-out | ${health.highestFanOut?.id ?? "none"} (${health.highestFanOut?.count ?? 0}) |`,
		"",
		`Cycles: ${cycles}`,
		"",
		"```mermaid",
		renderGraphMermaid(graph),
		"```",
	].join("\n")
}

export const runCli = async (argv: string[]): Promise<number> => {
	let parsed: ReturnType<typeof parseCliFlags>
	try {
		parsed = parseCliFlags(argv)
	} catch (error) {
		process.stderr.write(`${(error as Error).message}\n`)
		return 2
	}
	const { command, positional, flags } = parsed

	if (command === "help") {
		process.stdout.write(HELP_TEXT)
		return 0
	}

	const cwd = flags.cwd !== undefined ? path.resolve(flags.cwd) : process.cwd()
	const useColor = flags.noColor !== true && process.stdout.isTTY === true
	if (!useColor) kleur.enabled = false

	if (command === "snapshot" || command === "graph") {
		try {
			if (command === "snapshot") {
				const workspace = await loadWorkspace(cwd)
				const graph = await buildDependencyGraph(workspace)
				if (graph.unresolvedImports.length > 0) {
					for (const item of graph.unresolvedImports) {
						process.stderr.write(`unresolved import: ${item.from} -> ${item.specifier}\n`)
					}
					return 2
				}
				const output = resolveFrom(
					workspace.root,
					flags.output ?? workspace.snapshotPath,
				)
				const serialized = serializeSnapshot(graph)
				if (flags.check === true) {
					if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== serialized) {
						process.stdout.write("Dependency snapshot is stale. Run `preen snapshot` to update it.\n")
						return 1
					}
					process.stdout.write("Dependency snapshot is current.\n")
					return 0
				}
				if (fs.existsSync(output) && fs.readFileSync(output, "utf8") === serialized) {
					process.stdout.write("Dependency snapshot unchanged.\n")
					return 0
				}
				fs.mkdirSync(path.dirname(output), { recursive: true })
				const temporary = `${output}.tmp-${process.pid}`
				fs.writeFileSync(temporary, serialized)
				fs.renameSync(temporary, output)
				process.stdout.write(
					`Updated ${path.relative(workspace.root, output) || output}\n${graph.files.length} files, ${graph.edges.length} dependencies, ${graph.slices.length} slices\n`,
				)
				return 0
			}

			const options = projectionOptions(flags)
			if (positional[0] === "diff") {
				if (flags.base === undefined) {
					process.stderr.write("graph diff: expected --base <snapshot>\n")
					return 2
				}
				const base = readSnapshot(cwd, flags.base)
				const head =
					flags.head !== undefined
						? readSnapshot(cwd, flags.head)
						: await buildDependencyGraph(await loadWorkspace(cwd))
				assertGraphContainsScope([base, head], options.scope)
				const diff = diffProjectedGraphs(
					projectGraph(base, options),
					projectGraph(head, options),
				)
				writeResult(cwd, flags.output, renderDiff(diff, flags.format ?? "mermaid"))
				const gates = flags.failOn?.split(",").filter(Boolean) ?? []
				const supportedGates = new Set([
					"new-cycles",
					"new-unresolved-imports",
				])
				for (const gate of gates) {
					if (!supportedGates.has(gate)) {
						throw new Error(`unsupported graph regression gate: ${gate}`)
					}
				}
				let failed = false
				if (gates.includes("new-cycles")) {
					const baseCycles = new Set(
						analyzeGraphHealth(projectGraph(base, options)).cycles.map((cycle) =>
							cycle.join("\0"),
						),
					)
					for (const cycle of analyzeGraphHealth(projectGraph(head, options)).cycles) {
						if (baseCycles.has(cycle.join("\0"))) continue
						process.stderr.write(`new dependency cycle: ${cycle.join(", ")}\n`)
						failed = true
					}
				}
				if (gates.includes("new-unresolved-imports")) {
					const baseUnresolved = new Set(
						base.unresolvedImports.map((item) => `${item.from}\0${item.specifier}`),
					)
					for (const item of head.unresolvedImports) {
						if (baseUnresolved.has(`${item.from}\0${item.specifier}`)) continue
						process.stderr.write(
							`new unresolved import: ${item.from} -> ${item.specifier}\n`,
						)
						failed = true
					}
				}
				return failed ? 1 : 0
			}
			const graph =
				flags.snapshot !== undefined
					? readSnapshot(cwd, flags.snapshot)
					: await buildDependencyGraph(await loadWorkspace(cwd))
			assertGraphContainsScope([graph], options.scope)
			const projected = projectGraph(graph, options)
			const format = flags.format ?? "mermaid"
			const rendered =
				format === "json"
					? JSON.stringify(projected, null, 2)
					: format === "mermaid"
						? renderGraphMermaid(projected)
						: format === "markdown" || format === "text"
							? renderGraphReport(projected, format)
						: (() => {
								throw new Error(`invalid graph format: ${format}`)
							})()
			writeResult(cwd, flags.output, rendered)
			return 0
		} catch (error) {
			process.stderr.write(`${(error as Error).message}\n`)
			return 2
		}
	}

	let loaded
	try {
		loaded = await loadConfig(cwd, flags.config)
	} catch (error) {
		process.stderr.write(`${(error as Error).message}\n`)
		return 2
	}

	if (command === "check") {
		const result = await runChecks({ cwd, config: loaded.config })

		if (flags.json === true) {
			process.stdout.write(
				`${JSON.stringify(
					{
						configPath: loaded.configPath,
						scannedFileCount: result.scannedFileCount,
						durationMs: result.durationMs,
						diagnostics: result.diagnostics,
					},
					null,
					2,
				)}\n`,
			)
		} else {
			process.stdout.write(
				`${formatDiagnostics(result.diagnostics, { cwd, useColor })}\n`,
			)
			process.stdout.write(
				kleur.dim(
					`scanned ${result.scannedFileCount} files in ${result.durationMs}ms (config: ${path.relative(cwd, loaded.configPath) || loaded.configPath})\n`,
				),
			)
		}

		const errorCount = result.diagnostics.filter(
			(d) => d.severity === "error",
		).length
		const warningCount = result.diagnostics.length - errorCount
		if (errorCount > 0) return 1
		if (flags.maxWarnings !== undefined && warningCount > flags.maxWarnings)
			return 1
		return 0
	}

	if (command === "validate") {
		const issues = validateConfig(loaded.config)
		if (flags.json === true) {
			process.stdout.write(`${JSON.stringify({ issues }, null, 2)}\n`)
		} else {
			process.stdout.write(`${formatValidationIssues(issues, useColor)}\n`)
		}
		return issues.some((i) => i.severity === "error") ? 1 : 0
	}

	if (command === "explain") {
		if (positional.length === 0) {
			process.stderr.write(
				"explain: expected a file path\n  usage: preen explain <file>\n",
			)
			return 2
		}
		const targetFile = positional[0]
		if (targetFile === undefined) {
			process.stderr.write("explain: expected a file path\n")
			return 2
		}
		const result = explainFile(cwd, loaded.config, targetFile)
		if (flags.json === true) {
			process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
		} else {
			process.stdout.write(`${formatExplainResult(result, useColor)}\n`)
		}
		return 0
	}

	if (command === "visualize" && positional[0] === "rules") {
		const graph = generateRulesMermaid(loaded.config)
		process.stdout.write(`${graph}\n`)
		return 0
	}

	if (command === "show") {
		if (flags.json === true) {
			const resolved = {
				configPath: loaded.configPath,
				cwd,
				config: loaded.config,
			}
			process.stdout.write(`${JSON.stringify(resolved, null, 2)}\n`)
		} else {
			process.stdout.write(
				`${formatShowConfig(
					{ cwd, configPath: loaded.configPath, config: loaded.config },
					useColor,
				)}\n`,
			)
		}
		return 0
	}

	process.stderr.write(`unknown command: ${command}\n${HELP_TEXT}`)
	return 2
}
