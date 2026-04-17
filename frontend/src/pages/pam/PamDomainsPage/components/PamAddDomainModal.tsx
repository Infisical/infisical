import { Dispatch, SetStateAction, useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { PamDomainType, TPamDomain } from "@app/hooks/api/pamDomain";

import { PamDomainForm } from "./PamDomainForm/PamDomainForm";
import { DomainTypeSelect } from "./DomainTypeSelect";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  onComplete?: (domain: TPamDomain) => void;
};

type ContentProps = {
  closeSheet: (domain?: TPamDomain) => void;
  projectId: string;
  selectedDomainType: PamDomainType | null;
  setSelectedDomainType: Dispatch<SetStateAction<PamDomainType | null>>;
};

const Content = ({
  closeSheet,
  projectId,
  selectedDomainType,
  setSelectedDomainType
}: ContentProps) => {
  if (selectedDomainType) {
    return (
      <PamDomainForm
        closeSheet={closeSheet}
        onBack={() => setSelectedDomainType(null)}
        domainType={selectedDomainType}
        projectId={projectId}
      />
    );
  }

  return <DomainTypeSelect onSelect={setSelectedDomainType} />;
};

export const PamAddDomainModal = ({ isOpen, onOpenChange, projectId, onComplete }: Props) => {
  const [selectedDomainType, setSelectedDomainType] = useState<PamDomainType | null>(null);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(e) => {
        onOpenChange(e);
        setSelectedDomainType(null);
      }}
    >
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Create Domain</SheetTitle>
          <SheetDescription>
            {selectedDomainType ? "Input domain connection details" : "Select a domain type"}
          </SheetDescription>
        </SheetHeader>
        <Content
          projectId={projectId}
          closeSheet={(domain) => {
            if (domain && onComplete) onComplete(domain);
            onOpenChange(false);
            setSelectedDomainType(null);
          }}
          selectedDomainType={selectedDomainType}
          setSelectedDomainType={setSelectedDomainType}
        />
      </SheetContent>
    </Sheet>
  );
};
