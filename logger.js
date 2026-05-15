const os = require("os");
const axios = require("axios");

const SERVICE_NAME = "socket-service";
const HOST = os.hostname();

// ENV
const DEBUG = process.env.DEBUG_SOCKET === "true";
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "DEBUG_TOKEN";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// cấu hình gửi telegram
const TELEGRAM_ENABLED = !!TELEGRAM_CHAT_ID;
const TELEGRAM_LEVEL = (process.env.TELEGRAM_LEVEL || "ERROR").toUpperCase(); // chỉ gửi ERROR | WARN | INFO

// Hiện trạng cấu hình Telegram (dễ debug khi chạy dưới systemd)
console.log(
  `[Telegram] enabled=${TELEGRAM_ENABLED} level=${TELEGRAM_LEVEL} tokenSet=${!!TELEGRAM_TOKEN} chatIdSet=${!!TELEGRAM_CHAT_ID}`,
);

// buffer chống spam
let telegramQueue = [];
let isSending = false;

// ===== Utils =====
function generateId() {
  return Math.random().toString(36).substring(2, 8);
}

// ===== Telegram Sender (batch) =====
async function flushTelegram() {
  if (isSending || telegramQueue.length === 0) return;

  isSending = true;

  const batch = telegramQueue.splice(0, 5); // mỗi lần gửi 5 log

  const text = batch.join("\n\n");

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      },
    );
  } catch (err) {
    console.error("Telegram send failed:", err.message);
  }

  isSending = false;
}

// gửi định kỳ
setInterval(flushTelegram, 2000);

// ===== Format Telegram =====
function formatTelegram(level, scope, message, meta = {}) {
  const icons = {
    ERROR: "🔴",
    WARN: "🟠",
    INFO: "🟢",
    DEBUG: "🔵",
  };

  const icon = icons[level] || "⚪";
  const time = new Date().toISOString();

  // Short header: icon, scope, one-line message (level removed)
  let msg = `${icon} | ${message}`;

  // Prioritized meta keys to show first (common debug fields)
  const priority = [
    "userId",
    "adminId",
    "socketId",
    "traceId",
    "tripId",
    "error",
  ];
  const parts = [];

  // Helper to stringify and truncate long values
  const fmt = (v, max = 300) => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "string" ? v : JSON.stringify(v);
    if (s.length > max) s = s.substring(0, max - 1) + "…";
    return s;
  };

  for (const k of priority) {
    if (meta[k] !== undefined) {
      parts.push(`• <b>${k}:</b> ${fmt(meta[k])}`);
    }
  }

  // Append remaining meta keys (stable order)
  Object.keys(meta)
    .filter((k) => !priority.includes(k) && meta[k] !== undefined)
    .sort()
    .forEach((k) => parts.push(`• <b>${k}:</b> ${fmt(meta[k])}`));

  if (parts.length) msg += "\n" + parts.join("\n");

  // footer: keep only timestamp for quick traceability
  msg += `\n• ${time}`;

  return msg;
}

// ===== Core Log =====
function writeLog(level, scope, message, meta = {}) {
  const log = {
    time: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    host: HOST,
    scope,
    message,
    ...meta,
  };

  // console
  if (level === "ERROR") {
    console.error(JSON.stringify(log));
  } else {
    console.log(JSON.stringify(log));
  }

  // telegram
  if (TELEGRAM_ENABLED && shouldSendTelegram(level)) {
    const msg = formatTelegram(level, scope, message, meta);

    // Telegram limit is ~4096 characters; avoid cutting in the middle of a word
    const safe = truncateForTelegram(msg, 4000);
    telegramQueue.push(safe);
  }

  function truncateForTelegram(text, maxLen) {
    if (!text || text.length <= maxLen) return text;

    // Prefer cutting at newline, then space; otherwise cut at maxLen
    const delim = "\n";
    const idxNewLine = text.lastIndexOf(delim, maxLen);
    if (idxNewLine > Math.max(maxLen - 200, 0)) {
      return text.substring(0, idxNewLine);
    }

    const idxSpace = text.lastIndexOf(" ", maxLen);
    if (idxSpace > Math.max(maxLen - 200, 0)) {
      return text.substring(0, idxSpace);
    }

    return text.substring(0, maxLen);
  }
}

// ===== Level filter =====
function shouldSendTelegram(level) {
  const order = ["DEBUG", "INFO", "WARN", "ERROR"];
  return order.indexOf(level) >= order.indexOf(TELEGRAM_LEVEL);
}

// ===== Public APIs =====
function logInfo(scope, message, meta) {
  writeLog("INFO", scope, message, meta);
}

function logWarn(scope, message, meta) {
  writeLog("WARN", scope, message, meta);
}

function logError(scope, message, error, meta = {}) {
  writeLog("ERROR", scope, message, {
    ...meta,
    error: error?.message || error,
  });
}

function logDebug(scope, message, meta) {
  if (!DEBUG) return;
  writeLog("DEBUG", scope, message, meta);
}

// attach trace
function attachTrace(socket, userId) {
  const traceId = `${userId || "anon"}_${generateId()}`;
  socket.traceId = traceId;
  return traceId;
}

module.exports = {
  logInfo,
  logWarn,
  logError,
  logDebug,
  attachTrace,
  formatTelegram,
};
