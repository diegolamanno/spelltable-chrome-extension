import { defineConfig } from "vite";
import path, { resolve } from "path";
import react from "@vitejs/plugin-react";

const rootDir = resolve(__dirname);
const srcDir = resolve(rootDir, "src");
const pagesDir = resolve(srcDir, "pages");

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: resolve(rootDir, "dist"),
    rollupOptions: {
      input: {
        // contentInjected: resolve(pagesDir, 'content', 'injected', 'index.ts'),
        // contentUI: resolve(pagesDir, 'content', 'ui', 'index.ts'),
        content: resolve(pagesDir, "content", "index.tsx"),
        background: resolve(pagesDir, "background", "index.tsx"),
        popup: resolve(pagesDir, "popup", "index.html"),
      },
      output: {
        entryFileNames: "src/pages/[name]/index.js",
        chunkFileNames: "assets/js/[name].js",
        assetFileNames: (assetInfo) => {
          const { name } = path.parse(assetInfo.name);
          const assetFileName = name;
          return `assets/[ext]/${assetFileName}.chunk.[ext]`;
        },
      },
    },
  },
});
