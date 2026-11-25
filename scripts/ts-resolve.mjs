// Lets a plain Node script import the Hub's own TypeScript modules: it finds
// "@/lib/..." and imports written without an extension, as the app's bundler does.
// Node removes the types itself. Used by scripts/check-store.mjs.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, next) {
  let target = null;
  if (specifier.startsWith("@/")) target = path.join(root, "src", specifier.slice(2));
  else if (/^\.\.?\//.test(specifier) && context.parentURL?.startsWith("file:") && !path.extname(specifier)) {
    target = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (target) {
    for (const ending of [".ts", ".tsx", "/index.ts"]) {
      if (existsSync(target + ending)) return next(pathToFileURL(target + ending).href, context);
    }
  }
  return next(specifier, context);
}
