import { useState } from "react";

import { HoneyTokenForm } from "@app/components/honey-tokens/forms";
import { HoneyTokenModalHeader } from "@app/components/honey-tokens/HoneyTokenModalHeader";
import {
  HoneyTokenSelect,
  THoneyTokenSelection
} from "@app/components/honey-tokens/HoneyTokenSelect";
import {
  DocumentationLinkBadge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
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
  selection: THoneyTokenSelection | null;
  setSelection: (selection: THoneyTokenSelection | null) => void;
  onCancel: () => void;
} & SharedProps;

const Content = ({ setSelection, selection, onCancel, ...props }: ContentProps) => {
  if (selection) {
    return (
      <HoneyTokenForm
        onCancel={onCancel}
        type={selection.type}
        hosting={selection.hosting}
        {...props}
      />
    );
  }

  return <HoneyTokenSelect onSelect={setSelection} />;
};

export const CreateHoneyTokenModal = ({ onOpenChange, isOpen, ...props }: Props) => {
  const [selection, setSelection] = useState<THoneyTokenSelection | null>(null);

  const closeSheet = () => {
    setSelection(null);
    onOpenChange(false);
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
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-5xl">
        <SheetHeader className="border-b">
          {selection ? (
            <HoneyTokenModalHeader type={selection.type} hosting={selection.hosting} />
          ) : (
            <SheetTitle>
              <div className="flex items-center gap-x-2">
                Add Honey Token
                <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/honey-tokens/overview" />
              </div>
            </SheetTitle>
          )}
          {!selection && (
            <SheetDescription>Choose where Infisical creates the decoy credentials.</SheetDescription>
          )}
        </SheetHeader>
        {selection ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <Content
              onComplete={closeSheet}
              onCancel={() => setSelection(null)}
              selection={selection}
              setSelection={setSelection}
              {...props}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <Content
              onComplete={closeSheet}
              onCancel={() => setSelection(null)}
              selection={selection}
              setSelection={setSelection}
              {...props}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
