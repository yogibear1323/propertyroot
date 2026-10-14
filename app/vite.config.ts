import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
// Served at https://yogibear1323.github.io/propertyroot/ (VITE_BASE=/propertyroot/). Pages has no SPA rewrites,
// so /app gets app.html and unknown paths fall back to 404.html.
const base = process.env.VITE_BASE || "/";
let out = "dist";
const spa: Plugin = { name: "spa", apply: "build", configResolved(c) { out = resolve(c.root, c.build.outDir); },
  closeBundle() { const i = resolve(out, "index.html"); if (existsSync(i)) for (const n of ["404", "app"]) copyFileSync(i, resolve(out, `${n}.html`)); } };
export default defineConfig({ base, plugins: [react(), spa], test: { environment: "node", server: { deps: { inline: [/@creit\.tech/, /@stellar\/freighter-api/] } } } } as never);
