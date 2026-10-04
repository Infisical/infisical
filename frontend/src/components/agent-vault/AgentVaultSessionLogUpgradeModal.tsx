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
      description:
        "Your current plan does not include session logs, which record every request your agents make. To unlock them, upgrade to the Infisical Enterprise plan.",
      isEnterpriseFeature: true
    }}
  />
);
