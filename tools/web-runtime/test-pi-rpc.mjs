import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

if (!process.env.PI_BINARY) throw new Error("PI_BINARY must identify the installed Pi executable");
const root = fileURLToPath(new URL("../../", import.meta.url));
const started = Date.now();
const child = spawn(process.env.PI_BINARY, ["--mode", "rpc", "--no-session", "--no-extensions", "--no-skills", "--no-mcp", "--no-context-files", "-e", resolve(root, "tools/web-runtime/adapters/pi/extension-pi.mjs")], {cwd: root, env: {...process.env, PI_OFFLINE: "1", PI_TELEMETRY: "0"}, stdio: ["pipe", "pipe", "pipe"]});
let buffer = "";
let received = false;
const deadline = setTimeout(() => { console.log("BLOCKED: RPC get_state exceeded 20 seconds"); child.kill("SIGTERM"); process.exitCode = 1; }, 20000);
child.stdout.on("data", chunk => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    try {
      const event = JSON.parse(line);
      if (event.id === "startup-state") {
        received = event.success === true;
        console.log(JSON.stringify({test: "rpc-startup", success: received, durationMs: Date.now() - started, model: event.data?.model?.id, provider: event.data?.model?.provider}));
        clearTimeout(deadline); child.kill("SIGTERM");
      }
    } catch {}
  }
});
child.stderr.on("data", chunk => { if (/Failed to load extension|ERR_MODULE_NOT_FOUND|EROFS/.test(String(chunk))) console.log("RPC startup reported a loader or filesystem error"); });
child.on("exit", () => { clearTimeout(deadline); if (!received) process.exitCode = 1; });
child.stdin.write(JSON.stringify({id: "startup-state", type: "get_state"}) + "\n");
