// SecurityAuditor — verdict helpers of the real-runtime acceptance that can be tested offline.
import fs from "node:fs";
import path from "node:path";

// By resolved file, not by name: another skill's SKILL.md or a copy never counts, the dispatcher's link does.
export function isDispatcherRead(arg, cwd, harness) {
  const m = String(arg).match(/[^\s"']*SKILL\.md\b/);
  if (!m) return false;
  try { return fs.realpathSync(path.resolve(cwd, m[0])) === fs.realpathSync(path.join(harness, "SKILL.md")); } catch { return false; }
}

// The answer names the engagement and says it doesn't exist. Text only: the scenario also requires the failing tool call.
export function reportsMissingEngagement(text, name) {
  return String(text).includes(name) && /n[aã]o (existe|foi (encontrad|localizad)|encontr|aparece|localizad|h[aá] (um |nenhum |o )?engagement)|not[ -]found|no engagement|inexistente/i.test(text);
}
