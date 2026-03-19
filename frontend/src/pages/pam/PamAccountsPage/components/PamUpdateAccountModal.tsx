import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { TPamAccount } from "@app/hooks/api/pam";

import { PamAccountForm } from "./PamAccountForm/PamAccountForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  account?: TPamAccount;
};

export const PamUpdateAccountModal = ({ isOpen, onOpenChange, account }: Props) => {
  if (!account) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange} modal={false}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Edit Account</SheetTitle>
          <SheetDescription>Update account details.</SheetDescription>
        </SheetHeader>
        <PamAccountForm
          closeSheet={() => onOpenChange(false)}
          account={account}
          projectId={account.projectId}
        />
      </SheetContent>
    </Sheet>
  );
};
