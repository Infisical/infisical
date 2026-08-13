import { Sheet, SheetContent, SheetHeader } from "@app/components/v3";
import { TProxiedService } from "@app/hooks/api/proxiedServices/types";

import { EditProxiedServiceForm } from "./forms";
import { ProxiedServiceModalHeader } from "./ProxiedServiceModalHeader";

type Props = {
  proxiedService?: TProxiedService;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  existingNames?: string[];
};

export const EditProxiedServiceModal = ({
  proxiedService,
  isOpen,
  onOpenChange,
  projectId,
  existingNames = []
}: Props) => {
  if (!proxiedService) return null;

  const otherNames = existingNames.filter((name) => name !== proxiedService.name);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full w-screen flex-col gap-y-0 sm:max-w-[90vw] xl:max-w-7xl">
        <SheetHeader className="border-b">
          <ProxiedServiceModalHeader
            title={proxiedService.name}
            subtitle="Update how an agent gateway brokers this service."
          />
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <EditProxiedServiceForm
            proxiedService={proxiedService}
            projectId={projectId}
            existingNames={otherNames}
            onComplete={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};
