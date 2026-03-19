import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { PAM_DISCOVERY_TYPE_MAP, TPamDiscoverySource } from "@app/hooks/api/pamDiscovery";

import { PamDiscoverySourceForm } from "./PamDiscoverySourceForm/PamDiscoverySourceForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  source?: TPamDiscoverySource;
};

export const PamUpdateDiscoverySourceModal = ({ isOpen, onOpenChange, source }: Props) => {
  if (!source) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange} modal={false}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Edit Discovery Source</SheetTitle>
          <SheetDescription>
            Update details for this {PAM_DISCOVERY_TYPE_MAP[source.discoveryType].name} discovery
            source
          </SheetDescription>
        </SheetHeader>
        <PamDiscoverySourceForm
          closeSheet={() => onOpenChange(false)}
          source={source}
          projectId={source.projectId}
        />
      </SheetContent>
    </Sheet>
  );
};
