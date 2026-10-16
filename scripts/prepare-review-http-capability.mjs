import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv[2] === "production" ? "production" : "development";
const target = resolve("src-tauri/capabilities/reviews-http.json");
const env = {};
for (const name of [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`]) {
  const file = resolve(name);
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const value = match[2];
    env[match[1]] = value.startsWith('"') && value.endsWith('"') ||
      value.startsWith("'") && value.endsWith("'") ? value.slice(1, -1) : value;
  }
}
Object.assign(env, process.env);
const raw = env.VITE_REVIEWS_API_BASE_URL?.trim();

if (!raw || raw.includes("YOUR_") || raw.includes("example.invalid")) {
  rmSync(target, { force: true });
  process.exit(0);
}

let url;
try {
  url = new URL(raw);
} catch {
  throw new Error("VITE_REVIEWS_API_BASE_URL must be a valid URL.");
}
const isLoopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
if (
  (url.protocol !== "https:" && !(mode === "development" && isLoopback && url.protocol === "http:")) ||
  url.pathname !== "/" ||
  url.search ||
  url.hash ||
  url.username ||
  url.password
) {
  throw new Error("Review API URL must be a bare HTTPS origin (loopback HTTP is allowed only in development).");
}

const capability = {
  $schema: "../gen/schemas/desktop-schema.json",
  identifier: "reviews-http",
  description: "Allow review requests to this build's configured API host only",
  windows: ["main"],
  permissions: [{ identifier: "http:default", allow: [{ url: `${url.origin}/*` }] }],
};
writeFileSync(target, `${JSON.stringify(capability, null, 2)}\n`);
