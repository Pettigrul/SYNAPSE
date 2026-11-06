import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";

const packageDir = process.env.PI_PKG_DIR;
if (!packageDir) throw new Error("PI_PKG_DIR must identify the installed Pi package");
const runtime = await import(pathToFileURL(resolve(packageDir, "dist/index.js")));
const loader = await import(pathToFileURL(resolve(packageDir, "dist/core/extensions/loader.js")));
const entry = fileURLToPath(new URL("./adapters/pi/extension-pi.mjs", import.meta.url));
const loaded = await loader.loadExtensions([entry], process.cwd(), runtime.createEventBus(), loader.createExtensionRuntime());
assert.deepEqual(loaded.errors, []);
assert.equal(loaded.extensions.length, 1);
const extension = loaded.extensions[0];
assert.deepEqual([...extension.tools.keys()].sort(), ["securityauditor_capabilities", "securityauditor_invoke"]);
const result = await extension.tools.get("securityauditor_capabilities").definition.execute("entry-probe", {op: "list"}, new AbortController().signal);
assert.equal(result.isError, false);
console.log("PASS: versioned discovery entry loaded by real Pi loader; capabilities invoked without model");
