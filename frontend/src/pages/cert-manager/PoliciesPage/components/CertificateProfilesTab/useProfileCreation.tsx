import { useRef, useState } from "react";
import { subject } from "@casl/ability";

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
  onCreated: (profile: TCertificateProfile) => void | Promise<void>,
  { mode = "create-and-attach" }: { mode?: "create-only" | "create-and-attach" } = {}
): ComboboxSheetCreationConfig<TOption> | undefined => {
  const { permission } = useProjectPermission();
  const requiresAttachment = mode === "create-and-attach";
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
  const canAttachProfile = (slug: string) =>
    permission.can(
      ProjectPermissionCertificateProfileActions.ManageApplicationAttachments,
      subject(ProjectPermissionSub.CertificateProfiles, { slug })
    );

  if (
    !permission.can(
      ProjectPermissionCertificateProfileActions.Create,
      ProjectPermissionSub.CertificateProfiles
    ) ||
    (requiresAttachment &&
      !permission.can(
        ProjectPermissionCertificateProfileActions.ManageApplicationAttachments,
        ProjectPermissionSub.CertificateProfiles
      ))
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
          onComplete={(profile) => {
            if (requiresAttachment && !canAttachProfile(profile.slug)) {
              throw new Error(
                "The profile was created, but you no longer have permission to attach it to an application."
              );
            }
            return onCreated(profile);
          }}
          initialSlug={initialInput}
          validateSlug={(slug) =>
            permission.can(
              ProjectPermissionCertificateProfileActions.Create,
              subject(ProjectPermissionSub.CertificateProfiles, { slug })
            ) &&
            (!requiresAttachment || canAttachProfile(slug))
              ? undefined
              : `You don't have permission to ${requiresAttachment ? "create and attach" : "create"} a profile with this name. Choose an allowed name.`
          }
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
