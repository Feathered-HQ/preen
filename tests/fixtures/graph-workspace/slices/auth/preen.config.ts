export default {
	include: ["src/**/*.ts"],
	graph: { sliceId: "auth" },
	independentModules: [
		{
			module: "src/**/*.ts",
			allowImportsFrom: ["common/src/**", "src/**"],
		},
	],
}
