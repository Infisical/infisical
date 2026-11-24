import { useState } from "react";

import {
  DiscardChangesAlertDialog,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Sheet,
  SheetContent,
  Spinner
} from "@app/components/v3";
import { useDiscardChangesGuard } from "@app/hooks";
import { TAgentVaultHook } from "@app/hooks/api/agentVault/types";

import { HookForm } from "./HookForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Left out to create one. */
  hook?: TAgentVaultHook | null;
  isLoading?: boolean;
  isReadOnly?: boolean;
  onSaved?: (hook: TAgentVaultHook) => void;
};

export const HookSheet = ({
  isOpen,
  onOpenChange,
  hook,
  isLoading = false,
  isReadOnly = false,
  onSaved
}: Props) => {
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const close = () => {
    setIsDirty(false);
    onOpenChange(false);
  };
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: close });

  let content = (
    <HookForm
      key={hook?.id ?? "new"}
      hook={hook}
      isReadOnly={isReadOnly}
      onSaved={(saved) => {
        close();
        onSaved?.(saved);
      }}
      onCancel={requestDiscard}
      onDirtyChange={setIsDirty}
      onPendingChange={setIsPending}
    />
  );
  if (isLoading) {
    content = (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="sm" variant="av" />
      </div>
    );
  } else if (isReadOnly && !hook) {
    content = (
      <Empty className="m-4 border">
        <EmptyHeader>
          <EmptyTitle>Hook not found</EmptyTitle>
          <EmptyDescription>
            This hook doesn&apos;t exist, or you don&apos;t have access to it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && requestDiscard()}>
        <SheetContent
          size="form"
          className="flex h-full max-h-full flex-col gap-y-0"
          isPending={isPending}
        >
          {content}
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your changes to this hook will be lost."
      />
    </>
  );
};
