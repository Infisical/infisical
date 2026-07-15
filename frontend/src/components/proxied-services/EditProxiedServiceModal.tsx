import {
  DocumentationLinkBadge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { TDashboardProxiedService } from "@app/hooks/api/proxiedServices/types";

import { ProxiedServiceForm } from "./forms";

const QUICKSTART_DOCS_URL =
  "https://infisical.com/docs/documentation/platform/agent-proxy/quickstart";

type Props = {
  proxiedService?: TDashboardProxiedService;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
};

export const EditProxiedServiceModal = ({
  proxiedService,
  isOpen,
  onOpenChange,
  projectId
}: Props) => {
  if (!proxiedService) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col gap-y-0 overflow-y-auto sm:max-w-4xl">
        <SheetHeader className="border-b">
          <div className="flex items-center gap-x-2">
            <SheetTitle>Edit Proxied Service</SheetTitle>
            <DocumentationLinkBadge href={QUICKSTART_DOCS_URL} />
          </div>
          <SheetDescription>Update how the agent proxy brokers this service.</SheetDescription>
        </SheetHeader>
        <ProxiedServiceForm
          projectId={projectId}
          environment={proxiedService.environment.slug}
          secretPath={proxiedService.folder.path}
          proxiedService={proxiedService}
          onComplete={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
};
