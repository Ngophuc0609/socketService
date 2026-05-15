const { NAMESPACES } = require("../../shared/constants/namespaces");

function registerNamespaces(io, env) {
  const drivers = io.of(NAMESPACES.drivers);
  const customers = io.of(NAMESPACES.customers);
  const legacy = io.of(NAMESPACES.legacy);
  const admin = env.admin.monitorEnabled ? io.of(NAMESPACES.admin) : null;

  return {
    drivers,
    customers,
    legacy,
    admin,
  };
}

module.exports = { registerNamespaces };
