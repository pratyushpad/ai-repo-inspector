import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // CI runs `build` before `test`, which emits compiled copies of the suite
    // into dist/. Without this exclusion vitest collects both the TypeScript
    // sources and their compiled duplicates, doubling the reported test count
    // and letting a stale dist/ pass while the sources fail.
    exclude: ["**/node_modules/**", "dist/**"],
  },
});
