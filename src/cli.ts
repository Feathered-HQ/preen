import path from "node:path"
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

type CliFlags = {
	cwd?: string
	config?: string
	json?: boolean
	noColor?: boolean
	maxWarnings?: number
}

const HELP_TEXT = `\
preen — architecture linter for TypeScript monorepos

Usage:
  preen check                    run all checks against the config
  preen validate                 self-consistency check on the config alone
  preen explain <file>           show which rules apply to a file
  preen show                     pretty-print the resolved config as a visual guide
  preen graph                    print the dependency graph (Mermaid)

Options:
  --cwd <path>          working directory (default: process.cwd())
  --config <path>       explicit path to config file
  --json                emit machine-readable JSON instead of pretty output
  --no-color            disable ANSI colors
  --max-warnings <n>    treat as failure if warnings exceed this number
  --help, -h            show this help

Exit codes:
  0  no issues
  1  errors (or warnings beyond --max-warnings)
  2  internal error
`

const parseCliFlags = (
	argv: string[],
): { command: string; positional: string[]; flags: CliFlags } => {
	const command =
		argv[0] === undefined || argv[0].startsWith("--") ? "check" : argv[0]
	const remaining = command === argv[0] ? argv.slice(1) : argv
	const { values, positionals } = parseArgs({
		args: remaining,
		options: {
			cwd: { type: "string" },
			config: { type: "string" },
			json: { type: "boolean", default: false },
			"no-color": { type: "boolean", default: false },
			"max-warnings": { type: "string" },
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
	return { command, positional: positionals, flags }
}

const generateMermaidGraph = (config: {
	independentModules: { module: string; allowImportsFrom: string[] }[]
}): string => {
	const lines: string[] = ["graph TD"]
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
	return [...nodes, ...lines].join("\n")
}

export const runCli = async (argv: string[]): Promise<number> => {
	const { command, positional, flags } = parseCliFlags(argv)

	if (command === "help") {
		process.stdout.write(HELP_TEXT)
		return 0
	}

	const cwd = flags.cwd !== undefined ? path.resolve(flags.cwd) : process.cwd()
	const useColor = flags.noColor !== true && process.stdout.isTTY === true
	if (!useColor) kleur.enabled = false

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

	if (command === "graph") {
		const graph = generateMermaidGraph(loaded.config)
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
