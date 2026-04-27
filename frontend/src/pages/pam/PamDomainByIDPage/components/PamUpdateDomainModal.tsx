import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { PAM_DOMAIN_TYPE_MAP, TPamDomain } from "@app/hooks/api/pamDomain";

import { PamDomainForm } from "../../PamDomainsPage/components/PamDomainForm/PamDomainForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  domain?: TPamDomain;
};

export const PamUpdateDomainModal = ({ isOpen, onOpenChange, domain }: Props) => {
  if (!domain) return null;

  const domainTypeInfo = PAM_DOMAIN_TYPE_MAP[domain.domainType];

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Edit Domain</SheetTitle>
          <SheetDescription>
            Update details for this {domainTypeInfo?.name} domain.
          </SheetDescription>
        </SheetHeader>
        <PamDomainForm
          closeSheet={() => onOpenChange(false)}
          domain={domain}
          projectId={domain.projectId}
        />
      </SheetContent>
    </Sheet>
  );
};
