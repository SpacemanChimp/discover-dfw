/* The staging-hostname redirect contract (next.config.mjs): the exact
   retired hostname 308s to production with path + query preserved, and
   nothing else (previews, localhost) is touched. */
import { test } from "node:test";
import assert from "node:assert/strict";
import nextConfig, { STAGING_HOST, PRODUCTION_ORIGIN } from "../../next.config.mjs";

test("staging hostname permanently redirects to production, path preserved", async () => {
  const redirects = await nextConfig.redirects();
  const r = redirects.find((x) => x.has?.some((h) => h.type === "host" && h.value === STAGING_HOST));
  assert.ok(r, "host-matched redirect for the staging domain exists");
  assert.equal(r.permanent, true, "permanent (Next emits 308 for permanent redirects)");
  assert.equal(r.source, "/:path*", "matches every pathname");
  assert.equal(r.destination, `${PRODUCTION_ORIGIN}/:path*`, "carries the pathname to production");
  assert.equal(STAGING_HOST, "discover-dfw.vercel.app");
  assert.equal(PRODUCTION_ORIGIN, "https://www.discoverdfw.com");
});

test("only the exact staging hostname is matched — previews and dev are untouched", async () => {
  const redirects = await nextConfig.redirects();
  const hostRules = redirects.filter((x) => x.has?.some((h) => h.type === "host"));
  assert.equal(hostRules.length, 1, "exactly one host-matched rule");
  const hosts = hostRules[0].has.filter((h) => h.type === "host").map((h) => h.value);
  assert.deepEqual(hosts, [STAGING_HOST]);
  // an exact string, not a pattern that could swallow git-branch previews
  assert.ok(!hosts[0].includes("*") && !hosts[0].includes("("), "no wildcard host matching");
});
