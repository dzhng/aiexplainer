import react from "@vitejs/plugin-react";
import typegpu from "unplugin-typegpu/vite";
import { defineConfig, type Plugin } from "vite";

// The /lab/* review surfaces ship to dev and preview builds only (spec D40).
const withLab = process.env.VERCEL_ENV !== "production";

/** Serves every /lab/<route> path from the single lab entry, in dev and preview. */
function labRoutes(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    const url = req.url ?? "";
    const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    const pathname = url.slice(0, url.length - query.length);
    // Extension-less paths are routes; a dot in the query string doesn't make a file.
    if (pathname.startsWith("/lab/") && !pathname.includes("."))
      req.url = "/lab/index.html" + query;
    next();
  };
  return {
    name: "lab-routes",
    configureServer: (server) => void server.middlewares.use(rewrite),
    configurePreviewServer: (server) => void server.middlewares.use(rewrite),
  };
}

export default defineConfig({
  plugins: [react(), typegpu(), labRoutes()],
  build: {
    rollupOptions: {
      input: withLab ? { main: "index.html", lab: "lab/index.html" } : { main: "index.html" },
    },
  },
});
