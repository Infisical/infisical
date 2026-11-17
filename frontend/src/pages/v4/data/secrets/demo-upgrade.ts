import type { SecretsUpgradeAdapter } from "./contract-upgrade";
import { demoMutation, upgraded } from "./demo-store";

export const secretsUpgradeDemo: SecretsUpgradeAdapter = {
  useIsProjectAdmin: () => true,
  useMigrateProjectToV3: demoMutation(() => {
    upgraded.update(() => true);
    return {};
  })
};
