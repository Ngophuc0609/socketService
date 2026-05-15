const { spawnSync } = require("child_process");
const path = require("path");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function main() {
  const scriptsDir = path.resolve(process.cwd(), "scripts/phase6");
  console.log(`Running Phase 6 gate from ${scriptsDir}`);

  run("node", ["scripts/phase6/runPreflightCheck.js"]);
  run("node", ["scripts/phase6/runContractTest.js"]);
  run("node", ["scripts/phase6/runSoakTest.js"]);

  console.log("Phase 6 gate passed: preflight + contract + soak");
}

try {
  main();
} catch (error) {
  console.error("Phase 6 gate failed:", error?.message || error);
  process.exit(1);
}
