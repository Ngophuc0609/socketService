const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { createAuthService } = require("../../../src/modules/auth/authService");

function signHs256(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${headerB64}.${payloadB64}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

test("verifyUserToken accepts valid token when user secret configured", () => {
  const auth = createAuthService({
    adminSecret: "admin-secret",
    userSecret: "user-secret",
  });
  const token = signHs256(
    { sub: "u1", exp: Math.floor(Date.now() / 1000) + 60 },
    "user-secret",
  );

  const result = auth.verifyUserToken(token);
  assert.equal(result.valid, true);
  assert.equal(result.payload.sub, "u1");
});

test("verifyAdminToken rejects non-admin role", () => {
  const auth = createAuthService({
    adminSecret: "admin-secret",
    userSecret: "user-secret",
  });
  const token = signHs256(
    { sub: "a1", role: "operator", exp: Math.floor(Date.now() / 1000) + 60 },
    "admin-secret",
  );

  const result = auth.verifyAdminToken(token);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "invalid_role");
});

test("verifyUserToken keeps compatibility when user secret missing", () => {
  const auth = createAuthService({
    adminSecret: "admin-secret",
    userSecret: "",
  });
  const result = auth.verifyUserToken("any-token");
  assert.equal(result.valid, true);
  assert.equal(result.reason, "secret_not_configured");
});
