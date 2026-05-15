const baseLogger = require("../../../logger");

function createLoggerPort() {
  return {
    info: baseLogger.logInfo,
    warn: baseLogger.logWarn,
    error: baseLogger.logError,
    debug: baseLogger.logDebug,
    formatTelegram: baseLogger.formatTelegram,
    attachTrace: baseLogger.attachTrace,
  };
}

module.exports = { createLoggerPort };
