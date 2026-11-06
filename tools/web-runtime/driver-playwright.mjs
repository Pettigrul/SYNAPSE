// SecurityAuditor — playwright-core driver (H1a-F2 single-session + H1b-F1 pool).
// Lazily imports playwright-core so this module loads even when the package is absent
// (probe() will have reported the backend unavailable). Uses a PRE-INSTALLED browser
// channel (chrome/msedge/chromium) — NEVER downloads a browser. TLS is enforced
// (ignoreHTTPSErrors stays false); no web-security/cert bypass flags are set.
//
// Two entry points share ONE route-guard implementation:
//   launch(opts)      -> one browser + one context + one page (handle.close() closes both).
//                        BACKWARD-COMPATIBLE with H1a-F2 single-session.
//   launchPool(opts)  -> one browser; newSession() creates an ISOLATED BrowserContext+page
//                        (handle.close() closes only that context). Basis for multi-session:
//                        cookies/localStorage/sessionStorage are isolated per BrowserContext.

export async function createDriver() {
  const pw = await import("playwright-core"); // throws when not installed

  // Scope guard on EVERY request (main nav, subresources, redirects, JS-originated, popups).
  // NOTE: route.continue() lets Chromium auto-follow 3xx WITHOUT re-invoking the handler, so a
  // plain continue would leak out-of-scope REDIRECT targets. We fetch with maxRedirects:0 and
  // inspect Location against scope BEFORE the browser can follow it. route.fetch() preserves the
  // original request method/headers/body, so authenticated POST survives interception (validated
  // by the session suite). This handler is the single source of network events.
  function installRoute(context, { scopeAllows, onRequest }) {
    const emit = (e) => { try { onRequest && onRequest(e); } catch { /* ignore */ } };
    const safeAbort = async (route, reason) => { try { await route.abort(reason); } catch { /* route already handled / context closed */ } };
    const safeFulfill = async (route, opts) => { try { await route.fulfill(opts); } catch { await safeAbort(route, "failed"); } };
    return context.route("**/*", async (route) => {
      const req = route.request();
      const url = req.url();
      const base = { method: req.method(), url, resourceType: req.resourceType() };
      if (!scopeAllows(url)) { emit({ ...base, phase: "request", blocked: true }); return safeAbort(route, "blockedbyclient"); }
      let resp;
      try { resp = await route.fetch({ maxRedirects: 0 }); }        // preserves method+body
      catch (e) { emit({ ...base, phase: "error", blocked: true, detail: String(e && e.message || e) }); return safeAbort(route, "failed"); }
      const status = resp.status();
      const headers = resp.headers();
      if (status >= 300 && status < 400 && headers.location) {
        let abs; try { abs = new URL(headers.location, url).href; } catch { abs = headers.location; }
        if (!scopeAllows(abs)) { emit({ ...base, phase: "redirect", status, blocked: true, to: abs }); return safeAbort(route, "blockedbyclient"); }
      }
      emit({ ...base, phase: "response", status, headers });
      return safeFulfill(route, { response: resp });
    });
  }

  // Build the page handle shared by both entry points. `closeFn` decides scope of teardown
  // (context-only for a pool session; context+browser for a standalone launch).
  function buildHandle(browser, context, page, { onConsole, timeoutMs }, closeFn) {
    page.on("console", (m) => { try { onConsole && onConsole({ type: m.type(), text: m.text() }); } catch { /* ignore */ } });
    // Pop-ups: a new page is bound to the SAME context (same route guard); out-of-scope
    // navigations there are aborted by the route handler above.
    const _proc = (typeof browser.process === "function") ? browser.process() : null;
    const handle = {
      url: "",
      _pid: _proc ? _proc.pid : null, // for crash/termination diagnostics & tests
      _browser: browser,
      async goto(url) {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        const chain = [];
        let req = resp && resp.request();
        const hops = [];
        while (req) { const from = req.redirectedFrom(); if (!from) break; hops.unshift({ from: from.url(), to: req.url(), status: 0 }); req = from; }
        for (const h of hops) chain.push(h);
        handle.url = page.url();
        return { status: resp ? resp.status() : 0, finalUrl: handle.url, redirectChain: chain };
      },
      async snapshot() {
        const html = await page.content();
        let accessibilityText = "";
        try { accessibilityText = await page.locator("body").innerText({ timeout: 2000 }); } catch { /* ignore */ }
        return { html, accessibilityText };
      },
      async screenshot() { return await page.screenshot({ type: "png" }); },
      async click(spec) { await resolveLocator(page, spec).click({ timeout: timeoutMs }); return { ok: true }; },
      async fill(spec, value) { await resolveLocator(page, spec).fill(String(value), { timeout: timeoutMs }); return { ok: true }; },
      /** Capture auth/storage state for CONTROLLED reuse. Contains secrets — the caller
       *  (Identity Registry) keeps it internal and NEVER returns it to the LLM. */
      async storageState() { return await context.storageState(); },
      async evaluate(fn, arg) { return await page.evaluate(fn, arg); }, // synthetic-test probe only
      async close() { await closeFn(); },
    };
    return handle;
  }

  function launchOpts(channel, executablePath) {
    const o = { headless: true };
    if (executablePath) o.executablePath = executablePath;          // prefer the installed binary
    else if (channel && channel !== "chromium") o.channel = channel; // else a known channel
    return o;
  }

  return {
    // Single browser + single context + single page (H1a-F2 contract).
    async launch({ channel, executablePath, scopeAllows, onRequest, onConsole, signal, timeoutMs, ignoreHTTPSErrors = false }) {
      const browser = await pw.chromium.launch(launchOpts(channel, executablePath));
      const context = await browser.newContext({ ignoreHTTPSErrors, serviceWorkers: "block" });
      await installRoute(context, { scopeAllows, onRequest });
      const page = await context.newPage();
      if (signal) signal.addEventListener("abort", () => { try { browser.close(); } catch { /* ignore */ } }, { once: true });
      return buildHandle(browser, context, page, { onConsole, timeoutMs }, async () => { try { await context.close(); } finally { await browser.close(); } });
    },

    // One browser; each newSession() is an ISOLATED BrowserContext+page (multi-session).
    async launchPool({ channel, executablePath, timeoutMs, ignoreHTTPSErrors = false, signal } = {}) {
      const browser = await pw.chromium.launch(launchOpts(channel, executablePath));
      const _proc = (typeof browser.process === "function") ? browser.process() : null;
      if (signal) signal.addEventListener("abort", () => { try { browser.close(); } catch { /* ignore */ } }, { once: true });
      return {
        _browser: browser,
        _pid: _proc ? _proc.pid : null,
        async newSession({ scopeAllows, onRequest, onConsole, signal: sSignal, storageState, timeoutMs: sTimeout, ignoreHTTPSErrors: sTls } = {}) {
          const context = await browser.newContext({
            ignoreHTTPSErrors: sTls ?? ignoreHTTPSErrors, // never bypass TLS unless explicitly (kept false)
            serviceWorkers: "block",
            ...(storageState ? { storageState } : {}),     // CONTROLLED auth-state reuse
          });
          await installRoute(context, { scopeAllows, onRequest });
          const page = await context.newPage();
          if (sSignal) sSignal.addEventListener("abort", () => { try { context.close(); } catch { /* ignore */ } }, { once: true });
          // context-only teardown: closing one session must not affect sibling sessions
          return buildHandle(browser, context, page, { onConsole, timeoutMs: sTimeout ?? timeoutMs }, async () => { try { await context.close(); } catch { /* ignore */ } });
        },
        async close() { try { await browser.close(); } catch { /* ignore */ } },
      };
    },
  };
}

/** Prefer SEMANTIC locators (role/label/text/placeholder/testId); css is a last resort. */
function resolveLocator(page, spec) {
  if (!spec || typeof spec !== "object") throw new Error("locator spec required");
  if (spec.role) return page.getByRole(spec.role, spec.name ? { name: spec.name } : undefined);
  if (spec.label) return page.getByLabel(spec.label);
  if (spec.text) return page.getByText(spec.text);
  if (spec.placeholder) return page.getByPlaceholder(spec.placeholder);
  if (spec.testId) return page.getByTestId(spec.testId);
  if (spec.css) return page.locator(spec.css);
  throw new Error("unsupported locator spec");
}
