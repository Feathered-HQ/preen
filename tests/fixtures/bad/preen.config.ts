import { defineConfig } from "../../../src/define-config.js"

export default defineConfig({
	workspaceRoot: ".",
	include: ["src/**/*.{ts,tsx}"],
	folderStructure: {
		root: "src",
		structure: [
			{
				name: "features",
				children: [{ ruleId: "feature" }],
			},
			{
				name: "shared",
				children: [{ name: "{kebabCase}.ts", optional: true }],
			},
		],
		rules: {
			feature: {
				name: { case: "kebab-case" },
				children: [
					{ name: "{folderName}.tsx" },
					{
						name: "hooks",
						optional: true,
						children: [{ name: "use{PascalCase}.ts" }],
					},
				],
			},
		},
	},
	namingRules: [
		{
			filePattern: "src/**/*.consts.ts",
			allowOnly: ["variable"],
			variable: { case: "CONSTANT_CASE" },
		},
	],
	independentModules: [
		{
			module: "src/features/*",
			allowImportsFrom: ["{selfModule}/**", "src/shared/**", "node_modules/**"],
		},
	],
})
