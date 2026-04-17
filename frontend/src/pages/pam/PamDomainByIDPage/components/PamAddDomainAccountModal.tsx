import { createNotification } from "@app/components/notifications";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { useCreatePamAccount } from "@app/hooks/api/pam";
import { PAM_DOMAIN_TYPE_MAP, PamDomainType, TPamDomain } from "@app/hooks/api/pamDomain";

import { ActiveDirectoryAccountForm } from "../../PamAccountsPage/components/PamAccountForm/ActiveDirectoryAccountForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  domain: TPamDomain;
};

export const PamAddDomainAccountModal = ({ isOpen, onOpenChange, projectId, domain }: Props) => {
  const createPamAccount = useCreatePamAccount();
  const domainTypeInfo = PAM_DOMAIN_TYPE_MAP[domain.domainType];

  const handleSubmit = async (formData: Record<string, unknown>) => {
    try {
      await createPamAccount.mutateAsync({
        ...formData,
        parentType: domain.domainType,
        domainId: domain.id,
        projectId
      } as any);
      createNotification({
        text: "Successfully created account",
        type: "success"
      });
      onOpenChange(false);
    } catch {
      createNotification({
        text: "Failed to create account",
        type: "error"
      });
    }
  };

  const renderForm = () => {
    switch (domain.domainType) {
      case PamDomainType.ActiveDirectory:
        return (
          <ActiveDirectoryAccountForm
            onSubmit={handleSubmit as any}
            closeSheet={() => onOpenChange(false)}
          />
        );
      default:
        throw new Error(`Unhandled domain type: ${domain.domainType}`);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Create Domain Account</SheetTitle>
          <SheetDescription>Add an account to this {domainTypeInfo?.name} domain</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{renderForm()}</div>
      </SheetContent>
    </Sheet>
  );
};
