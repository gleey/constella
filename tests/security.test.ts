import assert from "node:assert";
import { NextRequest } from "next/server";
import {
  signAdminCookie,
  verifyAdminCookie,
  checkAdminAuth,
  requireAdmin,
  safeEqualSecret,
} from "../src/lib/admin-auth";
import { hashAdminPassword, verifyAdminPassword } from "../src/lib/admin-password";
import { isValidWikiTarget } from "../src/lib/fandom";
import { proxy, config as proxyConfig } from "../src/proxy";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
}

// 1. Constant-time secret compare
check("safeEqualSecret matches identical secrets", () => {
  assert.strictEqual(safeEqualSecret("abc-123", "abc-123"), true);
});
check("safeEqualSecret rejects different length/content", () => {
  assert.strictEqual(safeEqualSecret("abc-123", "abc-124"), false);
  assert.strictEqual(safeEqualSecret("abc", "abcdef"), false);
  assert.strictEqual(safeEqualSecret("", "a"), false);
});

// 2. Signed cookie round-trip & tamper rejection
check("signAdminCookie & verifyAdminCookie round-trip", () => {
  const secret = "test-secret-0123456789abcdef0123456789";
  const now = 1_700_000_000_000;
  const cookie = signAdminCookie(secret, now);
  assert.strictEqual(verifyAdminCookie(secret, cookie, now + 1000), true);
  assert.strictEqual(verifyAdminCookie("wrong-secret", cookie, now + 1000), false);
  assert.strictEqual(verifyAdminCookie(secret, cookie + "0", now + 1000), false);
  assert.strictEqual(verifyAdminCookie(secret, cookie, now + 31 * 24 * 60 * 60 * 1000), false);
});

// 3. Password hashing & verification
check("hashAdminPassword & verifyAdminPassword", () => {
  const hash = hashAdminPassword("correct-horse-battery-staple");
  assert.ok(hash.startsWith("scrypt:"));
  assert.strictEqual(verifyAdminPassword("correct-horse-battery-staple", hash), true);
  assert.strictEqual(verifyAdminPassword("wrong-password", hash), false);
});

// 4. checkAdminAuth enforcement when ADMIN_SECRET is set
check("checkAdminAuth validates header, bearer, and signed cookie", () => {
  const prevSecret = process.env.ADMIN_SECRET;
  try {
    process.env.ADMIN_SECRET = "super-secret-value-for-testing";
    const signed = signAdminCookie(process.env.ADMIN_SECRET);

    const noCreds = new NextRequest("http://localhost:3000/api/admin/drafts");
    assert.strictEqual(checkAdminAuth(noCreds).authorized, false);

    const badHeader = new NextRequest("http://localhost:3000/api/admin/drafts", {
      headers: { "x-admin-token": "nope" },
    });
    assert.strictEqual(checkAdminAuth(badHeader).authorized, false);

    const okHeader = new NextRequest("http://localhost:3000/api/admin/drafts", {
      headers: { "x-admin-token": process.env.ADMIN_SECRET },
    });
    assert.strictEqual(checkAdminAuth(okHeader).authorized, true);

    const okBearer = new NextRequest("http://localhost:3000/api/admin/drafts", {
      headers: { authorization: `Bearer ${process.env.ADMIN_SECRET}` },
    });
    assert.strictEqual(checkAdminAuth(okBearer).authorized, true);

    const okCookie = new NextRequest("http://localhost:3000/api/admin/drafts", {
      headers: { cookie: `admin_token=${signed}` },
    });
    assert.strictEqual(checkAdminAuth(okCookie).authorized, true);
  } finally {
    if (prevSecret === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = prevSecret;
  }
});

// 5. Wiki subdomain SSRF guard
check("isValidWikiTarget accepts valid targets and rejects SSRF payloads", () => {
  assert.strictEqual(isValidWikiTarget("solo-leveling"), true);
  assert.strictEqual(isValidWikiTarget("webtoon#PIGPEN"), true);
  assert.strictEqual(isValidWikiTarget("asurascans#Legend_of_Asura_–_The_Venom_Dragon"), true);
  assert.strictEqual(isValidWikiTarget("evil.com/?x="), false);
  assert.strictEqual(isValidWikiTarget("foo@evil.com"), false);
  assert.strictEqual(isValidWikiTarget("foo/bar"), false);
  assert.strictEqual(isValidWikiTarget(""), false);
});

async function runAsync() {
  const prevSecret = process.env.ADMIN_SECRET;
  const prevPath = process.env.ADMIN_PATH;
  try {
    process.env.ADMIN_SECRET = "super-secret-value-for-testing";
    process.env.ADMIN_PATH = "console-secret-99";

    // Matcher must cover multi-segment custom admin paths
    assert.ok(proxyConfig.matcher.some((m) => m.includes("/:path*")));

    // Default /admin and /admin/login must return 404 when ADMIN_PATH is set
    const adminRes = await proxy(new NextRequest("http://localhost:3000/admin"));
    assert.strictEqual(adminRes.status, 404);
    const adminLoginRes = await proxy(new NextRequest("http://localhost:3000/admin/login"));
    assert.strictEqual(adminLoginRes.status, 404);

    // Custom admin sub-route without cookie must redirect to /<ADMIN_PATH>/login
    const customSubRes = await proxy(new NextRequest("http://localhost:3000/console-secret-99/review"));
    assert.strictEqual(customSubRes.status, 307);
    assert.ok(customSubRes.headers.get("location")?.includes("/console-secret-99/login"));

    // Protected API without creds returns 401 in both proxy and requireAdmin
    const apiRes = await proxy(new NextRequest("http://localhost:3000/api/admin/drafts"));
    assert.strictEqual(apiRes.status, 401);
    const handlerRes = requireAdmin(new NextRequest("http://localhost:3000/api/admin/drafts"));
    assert.strictEqual(handlerRes?.status, 401);

    // Valid signed cookie passes proxy
    const signed = signAdminCookie(process.env.ADMIN_SECRET);
    const authedRes = await proxy(
      new NextRequest("http://localhost:3000/console-secret-99/review", {
        headers: { cookie: `admin_token=${signed}` },
      }),
    );
    assert.strictEqual(authedRes.status, 200);
    passed += 5;
  } finally {
    if (prevSecret === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = prevSecret;
    if (prevPath === undefined) delete process.env.ADMIN_PATH;
    else process.env.ADMIN_PATH = prevPath;
  }
  console.log(`security: ${passed} checks, 0 failed`);
}

runAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
