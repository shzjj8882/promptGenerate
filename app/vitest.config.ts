import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      include: ["hooks/**/*.ts", "lib/utils/**/*.ts", "lib/utils.ts", "components/shared/**/*.tsx"],
      exclude: ["**/*.test.*", "**/*.spec.*", "**/node_modules/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
