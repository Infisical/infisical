import { Dispatch, SetStateAction, useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { PamResourceType, TPamResource } from "@app/hooks/api/pam";

import { SshCaSetupModal } from "../../components/SshCaSetupModal";
import { PamResourceForm } from "./PamResourceForm";
import { ResourceTypeSelect } from "./ResourceTypeSelect";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  onComplete?: (resource: TPamResource) => void;
};

type ContentProps = {
  closeSheet: (resource?: TPamResource) => void;
  projectId: string;
  selectedResourceType: PamResourceType | null;
  setSelectedResourceType: Dispatch<SetStateAction<PamResourceType | null>>;
};

const Content = ({
  closeSheet,
  projectId,
  selectedResourceType,
  setSelectedResourceType
}: ContentProps) => {
  if (selectedResourceType) {
    return (
      <PamResourceForm
        closeSheet={closeSheet}
        onBack={() => setSelectedResourceType(null)}
        resourceType={selectedResourceType}
        projectId={projectId}
      />
    );
  }

  return <ResourceTypeSelect onSelect={setSelectedResourceType} />;
};

export const PamAddResourceModal = ({ isOpen, onOpenChange, projectId, onComplete }: Props) => {
  const [selectedResourceType, setSelectedResourceType] = useState<PamResourceType | null>(null);
  const [caSetupModalResourceId, setCaSetupModalResourceId] = useState<string | null>(null);

  const handleCaSetupModalClose = () => {
    setCaSetupModalResourceId(null);
  };

  return (
    <>
      <Sheet
        open={isOpen}
        onOpenChange={(e) => {
          onOpenChange(e);
          setSelectedResourceType(null);
        }}
        modal={false}
      >
        <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Create Resource</SheetTitle>
            <SheetDescription>
              {selectedResourceType
                ? "Input resource connection details"
                : "Select a resource type"}
            </SheetDescription>
          </SheetHeader>
          <Content
            projectId={projectId}
            closeSheet={(resource) => {
              if (resource && onComplete) onComplete(resource);
              onOpenChange(false);
              setSelectedResourceType(null);

              if (resource?.resourceType === PamResourceType.SSH) {
                setCaSetupModalResourceId(resource.id);
              }
            }}
            selectedResourceType={selectedResourceType}
            setSelectedResourceType={setSelectedResourceType}
          />
        </SheetContent>
      </Sheet>
      {caSetupModalResourceId && (
        <SshCaSetupModal
          isOpen={Boolean(caSetupModalResourceId)}
          onOpenChange={handleCaSetupModalClose}
          resourceId={caSetupModalResourceId}
        />
      )}
    </>
  );
};
