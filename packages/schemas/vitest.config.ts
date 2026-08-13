import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
      include: [
        "src/documentation-category.ts",
        "src/documentation-common.ts",
        "src/documentation-source.ts",
        "src/generation.ts",
      ],
    },
  },
});
