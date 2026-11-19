import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";

// `npm run build`       -> talks to the Flask API, output served by Flask from backend/static
// `npm run build:demo`  -> one self-contained HTML file; the recommender runs in the browser
export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    plugins: demo ? [react(), viteSingleFile()] : [react()],
    resolve: {
      alias: { "@api-impl": fileURLToPath(new URL(`./src/api/${demo ? "demo" : "http"}.js`, import.meta.url)) },
    },
    build: { outDir: demo ? "dist-demo" : "../backend/static", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
    server: { proxy: { "/api": "http://127.0.0.1:5000" } },
  };
});
