import { useState } from "react";

import { HoneyTokenForm } from "@app/components/honey-tokens/forms";
import { HoneyTokenModalHeader } from "@app/components/honey-tokens/HoneyTokenModalHeader";
import { HoneyTokenSelect } from "@app/components/honey-tokens/HoneyTokenSelect";
import {
  DocumentationLinkBadge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
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

const HONEY_TOKEN_TYPES = Object.values(HoneyTokenType);
const DEFAULT_HONEY_TOKEN_TYPE = HONEY_TOKEN_TYPES.length === 1 ? HONEY_TOKEN_TYPES[0] : null;

const Content = ({ setSelectedType, selectedType, onCancel, ...props }: ContentProps) => {
  if (selectedType) {
    return <HoneyTokenForm onCancel={onCancel} type={selectedType} {...props} />;
  }

  return <HoneyTokenSelect onSelect={setSelectedType} />;
};

export const CreateHoneyTokenModal = ({ onOpenChange, isOpen, ...props }: Props) => {
  const [selectedType, setSelectedType] = useState<HoneyTokenType | null>(DEFAULT_HONEY_TOKEN_TYPE);

  const handleReset = () => {
    setSelectedType(DEFAULT_HONEY_TOKEN_TYPE);
  };

  const closeSheet = () => {
    handleReset();
    onOpenChange(false);
  };

  const handleCancel = () => {
    if (DEFAULT_HONEY_TOKEN_TYPE) {
      closeSheet();
      return;
    }

    handleReset();
  };

  const handleSheetOpenChange = (open: boolean) => {
    if (!open) {
      closeSheet();
      return;
    }

    onOpenChange(true);
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1500px]">
        <SheetHeader className="border-b">
          {selectedType ? (
            <SheetTitle>
              <HoneyTokenModalHeader type={selectedType} />
            </SheetTitle>
          ) : (
            <SheetTitle>
              <div className="flex items-center gap-x-2">
                Add Honey Token
                <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/honey-tokens/overview" />
              </div>
            </SheetTitle>
          )}
          {!selectedType && (
            <SheetDescription>Select a provider to create a honey token for.</SheetDescription>
          )}
        </SheetHeader>
        {selectedType ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <Content
              onComplete={closeSheet}
              onCancel={handleCancel}
              selectedType={selectedType}
              setSelectedType={setSelectedType}
              {...props}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <Content
              onComplete={closeSheet}
              onCancel={handleCancel}
              selectedType={selectedType}
              setSelectedType={setSelectedType}
              {...props}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
