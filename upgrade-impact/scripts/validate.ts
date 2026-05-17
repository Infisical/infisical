import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateUpgradeImpactData } from "../src/validate.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const main = async () => {
  const { errors } = await validateUpgradeImpactData({
    dataDir: path.join(packageRoot, "data")
  });

  if (errors.length > 0) {
    for (const error of errors) {
      process.stderr.write(`- ${error}\n`);
    }
    process.exit(1);
  }

  process.stdout.write("Upgrade impact data is valid.\n");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
