import { HoneyTokenForm } from "@app/components/honey-tokens/forms";
import { HoneyTokenModalHeader } from "@app/components/honey-tokens/HoneyTokenModalHeader";
import { Sheet, SheetContent, SheetHeader } from "@app/components/v3";
import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";
import { TDashboardHoneyToken } from "@app/hooks/api/honeyTokens/types";

type Props = {
  honeyToken?: TDashboardHoneyToken;
  // The token's folder path. The dashboard row only carries the folder's name.
  secretPath: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const EditHoneyTokenModal = ({ isOpen, onOpenChange, honeyToken, secretPath }: Props) => {
  if (!honeyToken) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-5xl">
        <SheetHeader className="border-b">
          <HoneyTokenModalHeader type={honeyToken.type as HoneyTokenType} isEdit />
        </SheetHeader>
        <HoneyTokenForm
          onComplete={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
          honeyToken={honeyToken}
          type={honeyToken.type as HoneyTokenType}
          secretPath={secretPath}
          environment={honeyToken.environment.slug}
        />
      </SheetContent>
    </Sheet>
  );
};
