import { useRef, useState } from "react";

import { ComboboxSheetCreationConfig, DiscardChangesAlertDialog } from "@app/components/v3";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub,
  useProjectPermission
} from "@app/context";
import { TCertificateProfile } from "@app/hooks/api/certificateProfiles";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

import { CreateProfileForm } from "./CreateProfileModal";

type ProfileOption = { value: string; label: string };

export const useProfileCreation = <TOption = ProfileOption,>(
  onCreated: (profile: TCertificateProfile) => void | Promise<void>
): ComboboxSheetCreationConfig<TOption> | undefined => {
  const { permission } = useProjectPermission();
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const cancelRef = useRef(() => {});
  const { requestDiscard, confirmDiscard, isDiscardDialogOpen, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty,
      onDiscard: () => {
        setIsDirty(false);
        cancelRef.current();
      }
    });
  const requestCancel = (cancel: () => void) => {
    cancelRef.current = cancel;
    requestDiscard();
  };

  if (
    !permission.can(
      ProjectPermissionCertificateProfileActions.Create,
      ProjectPermissionSub.CertificateProfiles
    )
  )
    return undefined;

  return {
    mode: "sheet",
    size: "workspace",
    showHeader: false,
    emptyLabel: "Create New Profile",
    isPending,
    onDismiss: requestCancel,
    renderForm: ({ initialInput, complete, cancel }) => (
      <>
        <CreateProfileForm
          isOpen
          onClose={complete}
          onCancel={() => requestCancel(cancel)}
          onComplete={onCreated}
          initialSlug={initialInput}
          onDirtyChange={setIsDirty}
          onPendingChange={setIsPending}
        />
        <DiscardChangesAlertDialog
          open={isDiscardDialogOpen}
          onOpenChange={setIsDiscardDialogOpen}
          onDiscard={confirmDiscard}
          title="Discard Profile Changes?"
          description="Your unsaved profile configuration will be lost."
        />
      </>
    )
  };
};
