import { useCallback, useState } from "react";

import type { CapabilityUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import type { UpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";

import { UpgradeGate } from "./UpgradeGate";

type UpgradeRequest =
  | { intent: UpgradeIntent; paywallKey: string }
  | { intent: CapabilityUpgradeIntent; paywallKey: string };

export const useUpgradeGate = () => {
  const [request, setRequest] = useState<UpgradeRequest | null>(null);
  const openUpgradeGate = useCallback((nextRequest: UpgradeRequest) => setRequest(nextRequest), []);

  const upgradeGate = request ? (
    <UpgradeGate
      {...request}
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setRequest(null);
        }
      }}
    />
  ) : null;

  return { openUpgradeGate, upgradeGate };
};
