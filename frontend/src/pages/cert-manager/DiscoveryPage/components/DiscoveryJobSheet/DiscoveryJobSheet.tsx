import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";

import {
  Button,
  DiscardChangesAlertDialog,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { PKI_DISCOVERY_TYPE_MAP } from "@app/helpers/pkiDiscovery";
import { PkiDiscoveryType, TPkiDiscovery } from "@app/hooks/api/pkiDiscovery/types";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

import { DiscoveryJobForm } from "./DiscoveryJobForm";
import { DiscoveryTypeIcon } from "./DiscoveryTypeIcon";
import { DiscoveryTypeSelect } from "./DiscoveryTypeSelect";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  discovery?: TPkiDiscovery;
};

export const DiscoveryJobSheet = ({ isOpen, onClose, projectId, discovery }: Props) => {
  const [selectedType, setSelectedType] = useState<PkiDiscoveryType | null>(
    discovery?.discoveryType ?? null
  );
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedType(discovery?.discoveryType ?? null);
    setIsDirty(false);
  }, [isOpen, discovery]);

  const closeSheet = () => {
    setIsDirty(false);
    onClose();
  };

  const returnToTypeSelect = () => {
    setIsDirty(false);
    setSelectedType(null);
  };

  const discardActionRef = useRef<VoidFunction>(closeSheet);
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: () => discardActionRef.current() });

  const requestDiscardAction = (action: VoidFunction) => {
    discardActionRef.current = action;
    requestDiscard();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) requestDiscardAction(closeSheet);
  };

  const showBack = !discovery && Boolean(selectedType);

  const renderBody = () => {
    if (selectedType) {
      return (
        <DiscoveryJobForm
          key={`${selectedType}-${discovery?.id ?? "new"}`}
          discoveryType={selectedType}
          projectId={projectId}
          discovery={discovery}
          onComplete={closeSheet}
          onCancel={() => requestDiscardAction(discovery ? closeSheet : returnToTypeSelect)}
          onDirtyChange={setIsDirty}
        />
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        <DiscoveryTypeSelect onSelect={setSelectedType} />
      </div>
    );
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent size="workspace" className="flex h-full max-h-full flex-col gap-y-0 p-0">
          <SheetHeader className="border-b">
            {selectedType ? (
              <>
                {showBack && (
                  <Button
                    variant="link"
                    size="xs"
                    className="mb-1 w-fit px-0"
                    onClick={() => requestDiscardAction(returnToTypeSelect)}
                  >
                    <ArrowLeftIcon />
                    Select Another Type
                  </Button>
                )}
                <SheetTitle className="flex items-center gap-2">
                  <DiscoveryTypeIcon type={selectedType} className="size-5" />
                  {discovery
                    ? `Edit ${discovery.name}`
                    : `New ${PKI_DISCOVERY_TYPE_MAP[selectedType].name} Discovery Job`}
                </SheetTitle>
              </>
            ) : (
              <>
                <SheetTitle>New Discovery Job</SheetTitle>
                <SheetDescription>Choose where to look for certificates.</SheetDescription>
              </>
            )}
          </SheetHeader>
          {renderBody()}
        </SheetContent>
      </Sheet>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Discovery Job?"
        description="Your changes to this discovery job will be lost."
      />
    </>
  );
};
