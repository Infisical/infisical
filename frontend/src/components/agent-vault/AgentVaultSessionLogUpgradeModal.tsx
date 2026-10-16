import {
  AgentVaultSessionLogsUpgradeIntent,
  UpgradeGate
} from "@app/components/license/UpgradeGate";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const AgentVaultSessionLogUpgradeModal = ({ isOpen, onOpenChange }: Props) => (
  <UpgradeGate
    paywallKey="agent-vault.session-logs"
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    intent={{
      ...AgentVaultSessionLogsUpgradeIntent,
      isEnterpriseFeature: true
    }}
  />
);
