import { HoneyTokenForm } from "@app/components/honey-tokens/forms";
import { HoneyTokenModalHeader } from "@app/components/honey-tokens/HoneyTokenModalHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@app/components/v3";
import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";
import { TDashboardHoneyToken } from "@app/hooks/api/honeyTokens/types";

type Props = {
  honeyToken?: TDashboardHoneyToken;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const EditHoneyTokenModal = ({ isOpen, onOpenChange, honeyToken }: Props) => {
  if (!honeyToken) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-visible">
        <DialogHeader>
          <DialogTitle>
            <HoneyTokenModalHeader type={honeyToken.type as HoneyTokenType} isEdit />
          </DialogTitle>
        </DialogHeader>
        <HoneyTokenForm
          onComplete={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
          honeyToken={honeyToken}
          type={honeyToken.type as HoneyTokenType}
          secretPath={honeyToken.folder.path}
          environment={honeyToken.environment.slug}
        />
      </DialogContent>
    </Dialog>
  );
};
