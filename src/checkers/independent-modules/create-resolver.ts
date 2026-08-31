import fs from "node:fs"
import path from "node:path"
import { ResolverFactory } from "oxc-resolver"

export type ResolverOptions = {
	cwd: string
	tsconfig?: string
}

export type ResolveResult =
	| { resolved: string }
	| { error: string }
	| { external: true }

export type ImportResolver = {
	resolve: (fromFile: string, request: string) => ResolveResult
}

const NODE_BUILTINS = new Set([
	"assert",
	"async_hooks",
	"buffer",
	"child_process",
	"cluster",
	"console",
	"constants",
	"crypto",
	"dgram",
	"dns",
	"domain",
	"events",
	"fs",
	"http",
	"http2",
	"https",
	"module",
	"net",
	"os",
	"path",
	"perf_hooks",
	"process",
	"punycode",
	"querystring",
	"readline",
	"repl",
	"stream",
	"string_decoder",
	"timers",
	"tls",
	"trace_events",
	"tty",
	"url",
	"util",
	"v8",
	"vm",
	"wasi",
	"worker_threads",
	"zlib",
])

const isBuiltin = (request: string): boolean => {
	if (request.startsWith("node:")) return true
	const head = request.split("/")[0] ?? request
	return NODE_BUILTINS.has(head)
}

export const createResolver = (options: ResolverOptions): ImportResolver => {
	const tsconfigPath =
		options.tsconfig !== undefined
			? path.resolve(options.cwd, options.tsconfig)
			: locateTsconfig(options.cwd)

	const factoryOptions: any = {
		extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"],
		conditionNames: ["import", "require", "node", "default"],
		mainFields: ["module", "main"],
	}
	if (tsconfigPath !== null && fs.existsSync(tsconfigPath)) {
		factoryOptions.tsconfig = {
			configFile: tsconfigPath,
			references: "auto",
		}
	}

	const factory = new ResolverFactory(factoryOptions)

	return {
		resolve: (fromFile, request) => {
			if (isBuiltin(request)) return { external: true }
			const directory = path.dirname(fromFile)
			try {
				const result: any = factory.sync(directory, request)
				if (result.error !== undefined && result.error !== null && result.error !== "") {
					return { error: String(result.error) }
				}
				if (typeof result.path === "string" && result.path.length > 0) {
					return { resolved: result.path }
				}
				return { error: "no resolution" }
			} catch (error) {
				return { error: (error as Error).message }
			}
		},
	}
}

const locateTsconfig = (cwd: string): string | null => {
	let directory = cwd
	while (true) {
		const candidate = path.join(directory, "tsconfig.json")
		if (fs.existsSync(candidate)) return candidate
		const parent = path.dirname(directory)
		if (parent === directory) return null
		directory = parent
	}
}
