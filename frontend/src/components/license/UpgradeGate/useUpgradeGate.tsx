import { useCallback, useState } from "react";

import { UpgradeIntent } from "./upgrade-intents";
import { UpgradeGate } from "./UpgradeGate";

type UpgradeRequest = {
  intent: UpgradeIntent;
  paywallKey: string;
};

export const useUpgradeGate = () => {
  const [request, setRequest] = useState<UpgradeRequest | null>(null);
  const openUpgradeGate = useCallback((nextRequest: UpgradeRequest) => setRequest(nextRequest), []);

  const upgradeGate = request ? (
    <UpgradeGate
      intent={request.intent}
      paywallKey={request.paywallKey}
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
