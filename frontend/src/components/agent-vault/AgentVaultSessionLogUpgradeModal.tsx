import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const AgentVaultSessionLogUpgradeModal = ({ isOpen, onOpenChange }: Props) => (
  <UpgradePlanModal
    paywallKey="agent-vault.session-logs"
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    isEnterpriseFeature
    text="Your current plan does not include session logs, which record every request your agents make. To unlock them, upgrade to the Infisical Enterprise plan."
  />
);
