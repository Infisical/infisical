import {
  DocumentationLinkBadge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";

import { ProxiedServiceForm } from "./forms";

const QUICKSTART_DOCS_URL =
  "https://infisical.com/docs/documentation/platform/agent-proxy/quickstart";

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
          <div className="flex items-center gap-x-2">
            <SheetTitle>Create Proxied Service</SheetTitle>
            <DocumentationLinkBadge href={QUICKSTART_DOCS_URL} />
          </div>
          <SheetDescription>
            Define a service the agent proxy can broker secrets for.
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
