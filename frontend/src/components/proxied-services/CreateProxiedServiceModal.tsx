import { Sheet, SheetContent, SheetHeader } from "@app/components/v3";

import { ProxiedServiceForm } from "./forms";
import { ProxiedServiceModalHeader } from "./ProxiedServiceModalHeader";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  environment: string;
  secretPath: string;
};

export const CreateProxiedServiceModal = ({
  isOpen,
  onOpenChange,
  projectId,
  environment,
  secretPath
}: Props) => {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col gap-y-0 overflow-y-auto sm:max-w-4xl">
        <SheetHeader className="border-b">
          <ProxiedServiceModalHeader />
        </SheetHeader>
        <ProxiedServiceForm
          projectId={projectId}
          environment={environment}
          secretPath={secretPath}
          onComplete={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
};
