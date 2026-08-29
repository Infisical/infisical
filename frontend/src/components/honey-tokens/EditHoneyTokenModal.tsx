import { HoneyTokenForm } from "@app/components/honey-tokens/forms";
import { HoneyTokenModalHeader } from "@app/components/honey-tokens/HoneyTokenModalHeader";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@app/components/v3";
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
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1500px]">
        <SheetHeader className="border-b">
          <SheetTitle>
            <HoneyTokenModalHeader type={honeyToken.type as HoneyTokenType} isEdit />
          </SheetTitle>
        </SheetHeader>
        <HoneyTokenForm
          onComplete={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
          honeyToken={honeyToken}
          type={honeyToken.type as HoneyTokenType}
          secretPath={honeyToken.folder.path}
          environment={honeyToken.environment.slug}
        />
      </SheetContent>
    </Sheet>
  );
};
