import { useState } from "react";

import { HoneyTokenForm } from "@app/components/honey-tokens/forms";
import { HoneyTokenModalHeader } from "@app/components/honey-tokens/HoneyTokenModalHeader";
import { HoneyTokenSelect } from "@app/components/honey-tokens/HoneyTokenSelect";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DocumentationLinkBadge
} from "@app/components/v3";
import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";
import { ProjectEnv } from "@app/hooks/api/projects/types";

type SharedProps = {
  secretPath: string;
  environment?: string;
  environments?: ProjectEnv[];
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
} & SharedProps;

type ContentProps = {
  onComplete: () => void;
  selectedType: HoneyTokenType | null;
  setSelectedType: (type: HoneyTokenType | null) => void;
  onCancel: () => void;
} & SharedProps;

const Content = ({ setSelectedType, selectedType, onCancel, ...props }: ContentProps) => {
  if (selectedType) {
    return <HoneyTokenForm onCancel={onCancel} type={selectedType} {...props} />;
  }

  return <HoneyTokenSelect onSelect={setSelectedType} />;
};

export const CreateHoneyTokenModal = ({ onOpenChange, isOpen, ...props }: Props) => {
  const [selectedType, setSelectedType] = useState<HoneyTokenType | null>(null);

  const handleReset = () => {
    setSelectedType(null);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleReset();
        }
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-3xl overflow-visible">
        <DialogHeader>
          <DialogTitle>
            {selectedType ? (
              <HoneyTokenModalHeader type={selectedType} />
            ) : (
              <div className="flex items-center gap-x-2">
                Add Honey Token
                <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/honey-tokens/overview" />
              </div>
            )}
          </DialogTitle>
          {!selectedType && (
            <DialogDescription>Select a provider to create a honey token for.</DialogDescription>
          )}
        </DialogHeader>
        <Content
          onComplete={() => {
            onOpenChange(false);
          }}
          onCancel={handleReset}
          selectedType={selectedType}
          setSelectedType={setSelectedType}
          {...props}
        />
      </DialogContent>
    </Dialog>
  );
};
