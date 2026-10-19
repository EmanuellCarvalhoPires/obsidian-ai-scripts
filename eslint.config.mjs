import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{ ignores: ["main.js", "node_modules/", ".claude/", "esbuild.config.mjs", "vitest.config.mjs", "scripts/", "tests/", "docs/"] },
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.*"],
				},
			},
		},
		rules: {
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
			"obsidianmd/settings-tab/prefer-update-over-display": "off",
			"@typescript-eslint/no-deprecated": "off",
		},
	},
]);
