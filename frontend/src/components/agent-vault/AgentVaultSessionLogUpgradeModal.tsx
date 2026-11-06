import {
  AgentVaultSessionLogDefaultStorageUpgradeIntent,
  AgentVaultSessionLogsUpgradeIntent,
  UpgradeGate
} from "@app/components/license/UpgradeGate";
import { AgentVaultSessionLogStorageType } from "@app/hooks/api/agentVault/enums";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  storageType?: AgentVaultSessionLogStorageType;
};

export const AgentVaultSessionLogUpgradeModal = ({
  isOpen,
  onOpenChange,
  storageType = AgentVaultSessionLogStorageType.External
}: Props) => (
  <UpgradeGate
    paywallKey={
      storageType === AgentVaultSessionLogStorageType.Default
        ? "agent-vault.session-logs.default-storage"
        : "agent-vault.session-logs"
    }
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    intent={{
      ...(storageType === AgentVaultSessionLogStorageType.Default
        ? AgentVaultSessionLogDefaultStorageUpgradeIntent
        : AgentVaultSessionLogsUpgradeIntent),
      isEnterpriseFeature: true
    }}
  />
);
