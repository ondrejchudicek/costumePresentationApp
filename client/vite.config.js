import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "../server/public",
    emptyOutDir: true,

    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        tutorial: resolve(__dirname, "tutorial.html")
      }
    }
  },

  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true
      },
      "/models": {
        target: "http://localhost:3000",
        changeOrigin: true
      },
      "/images": {
        target: "http://localhost:3000",
        changeOrigin: true
      },
      "/tutorial_images": {
        target: "http://localhost:3000",
        changeOrigin: true
      }
    }
  }
});
