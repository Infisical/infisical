import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { ProjectPermissionActions } from "@app/context";
import { TAccessApprovalPolicy } from "@app/hooks/api/types";

import { RequestAccessForm } from "./RequestAccessForm";

export const RequestAccessModal = ({
  isOpen,
  onOpenChange,
  policies,
  ...props
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  policies: TAccessApprovalPolicy[];
  selectedActions?: ProjectPermissionActions[];
  secretPath?: string;
}) => {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col gap-y-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>Request Access</SheetTitle>
          <SheetDescription>
            Request access to secrets, folders and other resources based on the predefined policies.
          </SheetDescription>
        </SheetHeader>
        <RequestAccessForm onClose={() => onOpenChange(false)} policies={policies} {...props} />
      </SheetContent>
    </Sheet>
  );
};
