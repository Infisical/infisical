import { useEffect, useId, useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DiscardChangesAlertDialog,
  Field,
  FieldLabel
} from "@app/components/v3";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import {
  TPkiApplication,
  useAttachPkiApplicationProfiles,
  useDetachPkiApplicationProfile,
  useListPkiApplicationProfiles
} from "@app/hooks/api/pkiApplications";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";
import { useProfileCreation } from "@app/pages/cert-manager/PoliciesPage/components/CertificateProfilesTab/useProfileCreation";

type Option = { value: string; label: string };

type Props = {
  application: TPkiApplication | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const ConfigureProfilesModal = ({ application, isOpen, onOpenChange }: Props) => {
  const { orgId } = useParams({ strict: false });
  const { data: profilesData, isPending: profilesLoading } = useListCertificateProfiles({
    limit: 100
  });
  const { data: attachedProfiles } = useListPkiApplicationProfiles(application?.id ?? "");

  const attachProfiles = useAttachPkiApplicationProfiles();
  const detachProfile = useDetachPkiApplicationProfile();

  const profileOptions = useMemo<Option[]>(
    () =>
      (profilesData?.certificateProfiles ?? []).map((p) => ({
        value: p.id,
        label: p.slug
      })),
    [profilesData]
  );

  const initialOptions = useMemo<Option[]>(
    () => (attachedProfiles ?? []).map((p) => ({ value: p.profileId, label: p.profileSlug })),
    [attachedProfiles]
  );

  const [selected, setSelected] = useState<Option[]>(initialOptions);
  const inputId = useId();
  const profileCreation = useProfileCreation((profile) =>
    setSelected((previous) => [...previous, { value: profile.id, label: profile.slug }])
  );
  const { requestDiscard, confirmDiscard, isDiscardDialogOpen, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty:
        selected.length !== initialOptions.length ||
        selected.some(
          (option) => !initialOptions.some((initial) => initial.value === option.value)
        ),
      onDiscard: () => onOpenChange(false)
    });

  useEffect(() => {
    if (isOpen) setSelected(initialOptions);
  }, [isOpen, initialOptions]);

  const handleSave = async () => {
    if (!application) return;
    const nextIds = new Set(selected.map((o) => o.value));
    const currentIds = new Set(initialOptions.map((o) => o.value));
    const toAttach = [...nextIds].filter((id) => !currentIds.has(id));
    const toDetach = [...currentIds].filter((id) => !nextIds.has(id));

    if (toAttach.length === 0 && toDetach.length === 0) {
      onOpenChange(false);
      return;
    }

    try {
      if (toAttach.length > 0) {
        await attachProfiles.mutateAsync({ applicationId: application.id, profileIds: toAttach });
      }
      await Promise.all(
        toDetach.map((profileId) =>
          detachProfile.mutateAsync({ applicationId: application.id, profileId })
        )
      );
      createNotification({ type: "success", text: "Profiles updated" });
      onOpenChange(false);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to update profiles.";
      createNotification({ type: "error", text: detail });
    }
  };

  const isPending = attachProfiles.isPending || detachProfile.isPending;

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (open) onOpenChange(true);
          else requestDiscard();
        }}
      >
        <DialogContent isPending={isPending}>
          <DialogHeader>
            <DialogTitle>Configure Profiles</DialogTitle>
            <DialogDescription>
              Select the certificate profiles attached to {application?.name ?? "this Application"}.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (!isPending) handleSave();
            }}
          >
            <DialogBody>
              <fieldset disabled={isPending} className="min-w-0">
                <Field>
                  <FieldLabel htmlFor={inputId}>Certificate Profiles</FieldLabel>
                  <Combobox
                    id={inputId}
                    multiple
                    value={selected}
                    onValueChange={setSelected}
                    getOptionValue={(option) => option.value}
                    getOptionLabel={(option) => option.label}
                    isLoading={profilesLoading}
                    creation={profileCreation}
                    options={profileOptions}
                    placeholder="Select profiles..."
                  />
                </Field>
                {!profilesLoading && !profileOptions.length && (
                  <p className="mt-3 text-xs text-warning">
                    No certificate profiles available.{" "}
                    <Link
                      to="/organizations/$orgId/cert-manager/certificate-profiles"
                      params={{ orgId: orgId ?? "" }}
                      className="underline hover:text-warning"
                    >
                      Create one in Certificate Profiles
                    </Link>
                  </p>
                )}
              </fieldset>
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" isDisabled={isPending} onClick={requestDiscard}>
                Cancel
              </Button>
              <Button variant="project" type="submit" isPending={isPending}>
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Profile Changes?"
        description="Your pending profile changes will be lost."
      />
    </>
  );
};
