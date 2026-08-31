import { defineConfig } from "../../../src/define-config.js"

export default defineConfig({
	workspaceRoot: ".",
	include: ["src/**/*.{ts,tsx}"],
	ignorePatterns: [],
	folderStructure: {
		root: "src",
		structure: [
			{
				name: "features",
				children: [{ ruleId: "feature" }],
			},
			{
				name: "shared",
				children: [
					{ name: "{kebabCase}.ts", optional: true },
				],
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
		{
			filePattern: "src/**/*.types.ts",
			allowOnly: ["type", "interface", "enum"],
			type: { case: "PascalCase" },
			interface: { case: "PascalCase" },
		},
	],
	independentModules: [
		{
			module: "src/features/*",
			allowImportsFrom: ["{selfModule}/**", "src/shared/**", "node_modules/**"],
		},
	],
})
