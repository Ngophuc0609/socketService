const crypto = require("crypto");

function createAuthService({ adminSecret, userSecret }) {
  function base64UrlDecode(input) {
    let value = String(input || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const pad = 4 - (value.length % 4);
    if (pad !== 4) {
      value += "=".repeat(pad);
    }
    return Buffer.from(value, "base64").toString("utf8");
  }

  function decodeJwt(token) {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) {
      return null;
    }

    try {
      return {
        headerB64: parts[0],
        payloadB64: parts[1],
        signatureB64: parts[2],
        header: JSON.parse(base64UrlDecode(parts[0])),
        payload: JSON.parse(base64UrlDecode(parts[1])),
      };
    } catch (error) {
      return null;
    }
  }

  function signHs256(data, secret) {
    return crypto
      .createHmac("sha256", secret)
      .update(data)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  function verifyHs256Token(token, secret) {
    if (!secret) {
      return { valid: false, reason: "secret_not_configured", payload: null };
    }

    const decoded = decodeJwt(token);
    if (!decoded) {
      return { valid: false, reason: "invalid_token", payload: null };
    }

    if (decoded.header?.alg !== "HS256") {
      return { valid: false, reason: "invalid_algorithm", payload: null };
    }

    const expectedSig = signHs256(
      `${decoded.headerB64}.${decoded.payloadB64}`,
      secret,
    );

    if (expectedSig !== decoded.signatureB64) {
      return { valid: false, reason: "invalid_signature", payload: null };
    }

    const exp = decoded.payload?.exp;
    if (typeof exp === "number") {
      const nowInSeconds = Math.floor(Date.now() / 1000);
      if (exp <= nowInSeconds) {
        return { valid: false, reason: "token_expired", payload: null };
      }
    }

    return { valid: true, reason: "ok", payload: decoded.payload };
  }

  function parseBearer(authorizationHeader) {
    if (!authorizationHeader) return null;
    const parts = authorizationHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") return null;
    return parts[1] || null;
  }

  function readUserId(headers) {
    return headers["user_id"] || headers["userId"] || null;
  }

  function verifyAdminToken(token) {
    const verified = verifyHs256Token(token, adminSecret);
    if (!verified.valid) return verified;

    if (verified.payload?.role !== "admin") {
      return { valid: false, reason: "invalid_role", payload: null };
    }

    return verified;
  }

  function verifyUserToken(token) {
    // Backward-compatible mode: if no user secret is configured,
    // keep accepting Bearer tokens while rollout completes.
    if (!userSecret) {
      return { valid: true, reason: "secret_not_configured", payload: null };
    }

    return verifyHs256Token(token, userSecret);
  }

  return {
    parseBearer,
    readUserId,
    verifyAdminToken,
    verifyUserToken,
  };
}

module.exports = { createAuthService };
