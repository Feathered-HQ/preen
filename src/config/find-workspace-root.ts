import fs from "node:fs"
import path from "node:path"

const WORKSPACE_MARKERS = [
	"pnpm-workspace.yaml",
	"pnpm-workspace.yml",
	"lerna.json",
	".moon",
] as const

export const findWorkspaceRoot = (cwd: string): string | null => {
	let directory = path.resolve(cwd)
	while (true) {
		for (const marker of WORKSPACE_MARKERS) {
			if (fs.existsSync(path.join(directory, marker))) {
				return directory
			}
		}
		const parent = path.dirname(directory)
		if (parent === directory) return null
		directory = parent
	}
}
