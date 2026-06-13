import { defineConfig } from "vite";

// The simulation in /src/sim is dependency-free and DOM-free so it can also run
// headless under vitest / Node. Vite only handles the client bundle.
export default defineConfig({
  server: { open: true },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
