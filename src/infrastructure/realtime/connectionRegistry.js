function createConnectionRegistry() {
  const drivers = new Map();
  const customers = new Map();
  const legacy = new Map();

  return {
    drivers,
    customers,
    legacy,
    counters() {
      return {
        drivers: drivers.size,
        customers: customers.size,
        default: legacy.size,
      };
    },
  };
}

module.exports = { createConnectionRegistry };
