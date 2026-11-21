import {
  AgentVaultSessionLogDefaultStorageUpgradeIntent,
  AgentVaultSessionLogsUpgradeIntent
} from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import { AgentVaultSessionLogStorageType } from "@app/hooks/api/agentVault/enums";

import { UpgradeGate } from "../../../license";

export const UpgradeDialog = ({
  storageType,
  onClose
}: {
  storageType: AgentVaultSessionLogStorageType | null;
  onClose: () => void;
}) => {
  const isDefault = storageType === AgentVaultSessionLogStorageType.Default;
  return (
    <UpgradeGate
      paywallKey={
        isDefault ? "agent-vault.session-logs.default-storage" : "agent-vault.session-logs"
      }
      isOpen={storageType !== null}
      onOpenChange={(open) => !open && onClose()}
      intent={
        isDefault
          ? AgentVaultSessionLogDefaultStorageUpgradeIntent
          : AgentVaultSessionLogsUpgradeIntent
      }
    />
  );
};
