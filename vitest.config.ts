import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react({ include: /\.(jsx|tsx)$/ }) as unknown as never],
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
    testTimeout: 15_000,
    fileParallelism: false,
  },
});
