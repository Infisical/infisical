import { Dispatch, SetStateAction, useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { PamDiscoveryType } from "@app/hooks/api/pamDiscovery";

import { PamDiscoverySourceForm } from "./PamDiscoverySourceForm/PamDiscoverySourceForm";
import { DiscoveryTypeSelect } from "./DiscoveryTypeSelect";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
};

type ContentProps = {
  closeSheet: () => void;
  projectId: string;
  selectedType: PamDiscoveryType | null;
  setSelectedType: Dispatch<SetStateAction<PamDiscoveryType | null>>;
};

const Content = ({ closeSheet, projectId, selectedType, setSelectedType }: ContentProps) => {
  if (selectedType) {
    return (
      <PamDiscoverySourceForm
        closeSheet={closeSheet}
        onBack={() => setSelectedType(null)}
        discoveryType={selectedType}
        projectId={projectId}
      />
    );
  }

  return <DiscoveryTypeSelect onSelect={setSelectedType} />;
};

export const PamAddDiscoverySourceModal = ({ isOpen, onOpenChange, projectId }: Props) => {
  const [selectedType, setSelectedType] = useState<PamDiscoveryType | null>(null);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(e) => {
        onOpenChange(e);
        setSelectedType(null);
      }}
      modal={false}
    >
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Create Discovery Source</SheetTitle>
          <SheetDescription>
            {selectedType
              ? "Input discovery source connection details"
              : "Select a discovery source type"}
          </SheetDescription>
        </SheetHeader>
        <Content
          projectId={projectId}
          closeSheet={() => {
            onOpenChange(false);
            setSelectedType(null);
          }}
          selectedType={selectedType}
          setSelectedType={setSelectedType}
        />
      </SheetContent>
    </Sheet>
  );
};
