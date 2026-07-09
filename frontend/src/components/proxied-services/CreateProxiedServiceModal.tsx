import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";

import { ProxiedServiceForm } from "./forms";

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
      <SheetContent className="flex h-full flex-col gap-y-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>Create Proxied Service</SheetTitle>
          <SheetDescription>
            Define a service the agent proxy can broker credentials for.
          </SheetDescription>
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
