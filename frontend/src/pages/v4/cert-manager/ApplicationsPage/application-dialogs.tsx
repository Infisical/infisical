import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { z } from "zod";

import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { TPkiApplication } from "@app/hooks/api/pkiApplications/types";

import { useOrgId, useProjectPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useCertManagerProjectId } from "../components/certificate";
import { CertificateProfileSheet } from "../components/profile-sheet";

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(64, "Use 64 characters or fewer")
  .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only");
const descriptionSchema = z.string().trim().max(256, "Use 256 characters or fewer");

const issue = (schema: z.ZodType, value: string) => {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
};

export const useProfileOptions = () => {
  const { data, isPending } = useV4Adapter("certificates").useCertificateProfiles({ limit: 100 });
  return {
    options: (data?.certificateProfiles ?? []).map((profile) => ({
      value: profile.id,
      label: profile.slug
    })),
    totalCount: data?.totalCount ?? 0,
    isPending
  };
};

export const useProfileCreation = (onCreated: (profileId: string) => void) => {
  const { projectId } = useCertManagerProjectId(useOrgId());
  const { permission } = useProjectPermission(projectId ?? "");
  const [query, setQuery] = useState<string>();
  const canCreate =
    Boolean(projectId) &&
    permission.can(
      ProjectPermissionCertificateProfileActions.Create,
      ProjectPermissionSub.CertificateProfiles
    );
  return {
    canCreate,
    comboboxProps: canCreate
      ? {
          onCreate: (next: string) => setQuery(next),
          createLabel: (next: string) => `Create profile ${next}`
        }
      : {},
    sheet:
      projectId && query !== undefined ? (
        <CertificateProfileSheet
          projectId={projectId}
          initialSlug={query}
          onCreated={(profile) => onCreated(profile.id)}
          onClose={() => setQuery(undefined)}
        />
      ) : null
  };
};

const ApplicationForm = ({
  application,
  onClose,
  onCreated
}: {
  application?: TPkiApplication;
  onClose: () => void;
  onCreated?: (created: TPkiApplication) => void;
}) => {
  const adapter = useV4Adapter("pkiApplications");
  const create = adapter.useCreateApplication();
  const update = adapter.useUpdateApplication();
  const { options: profileOptions } = useProfileOptions();
  const initialName = application?.name ?? "";
  const initialDescription = application?.description ?? "";
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [profileIds, setProfileIds] = useState<string[]>([]);
  const profileCreation = useProfileCreation((profileId) =>
    setProfileIds((current) => [...current, profileId])
  );
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});
  const [pending, setPending] = useState(false);
  const dirty = name !== initialName || description !== initialDescription || profileIds.length > 0;
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: onClose
  });

  const submit = async () => {
    const next = {
      name: issue(nameSchema, name),
      description: issue(descriptionSchema, description)
    };
    setErrors(next);
    if (next.name || next.description) return;
    setPending(true);
    try {
      if (application) {
        await update.mutateAsync({
          applicationId: application.id,
          name: name.trim(),
          description: description.trim() || null
        });
        saved("Application updated");
        onClose();
        return;
      }
      const created = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        profileIds
      });
      saved(`Created ${created.name}`);
      onClose();
      onCreated?.(created);
    } catch (error) {
      failed(application ? "Failed to update application" : "Failed to create application", error);
    } finally {
      setPending(false);
    }
  };

  const formId = application ? "edit-pki-application" : "create-pki-application";
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestDiscard()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>{application ? "Edit application" : "Create application"}</DialogTitle>
          </DialogHeader>
          <form
            id={formId}
            noValidate
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              <Field
                label="Name"
                description="Lowercase letters, numbers and hyphens."
                error={errors.name}
              >
                <Input
                  mono
                  placeholder="my-service"
                  value={name}
                  invalid={Boolean(errors.name)}
                  onChange={(event) => {
                    setName(event.target.value);
                    setErrors((current) => ({ ...current, name: undefined }));
                  }}
                />
              </Field>
              <Field label="Description" optional error={errors.description}>
                <Textarea
                  rows={3}
                  placeholder="Issues and rotates certificates for my application stack."
                  value={description}
                  aria-invalid={Boolean(errors.description) || undefined}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setErrors((current) => ({ ...current, description: undefined }));
                  }}
                />
              </Field>
              {!application && (
                <Field
                  label="Certificate profiles"
                  optional
                  description="You can also attach profiles later from the application's settings."
                >
                  <Combobox
                    multiple
                    mono
                    label="Certificate profiles"
                    placeholder="Select profiles to attach"
                    emptyText="No certificate profiles yet"
                    options={profileOptions}
                    value={profileIds}
                    onValueChange={setProfileIds}
                    {...profileCreation.comboboxProps}
                  />
                </Field>
              )}
            </Stack>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={requestDiscard} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form={formId} loading={pending}>
              {application ? "Save changes" : "Create application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your unsaved application settings will be lost."
      />
      {profileCreation.sheet}
    </>
  );
};

export const ApplicationDialog = ({
  open,
  application,
  onClose,
  onCreated
}: {
  open: boolean;
  application?: TPkiApplication;
  onClose: () => void;
  onCreated?: (created: TPkiApplication) => void;
}) =>
  open ? (
    <ApplicationForm
      key={application?.id ?? "new"}
      application={application}
      onClose={onClose}
      onCreated={onCreated}
    />
  ) : null;

const ProfilesForm = ({
  application,
  initial,
  onClose
}: {
  application: TPkiApplication;
  initial: string[];
  onClose: () => void;
}) => {
  const adapter = useV4Adapter("pkiApplications");
  const attach = adapter.useAttachProfiles();
  const detach = adapter.useDetachProfile();
  const { options, isPending: optionsPending } = useProfileOptions();
  const [selected, setSelected] = useState(initial);
  const profileCreation = useProfileCreation((profileId) =>
    setSelected((current) => [...current, profileId])
  );
  const [pending, setPending] = useState(false);
  const initialSet = new Set(initial);
  const selectedSet = new Set(selected);
  const toAttach = selected.filter((id) => !initialSet.has(id));
  const toDetach = initial.filter((id) => !selectedSet.has(id));
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: toAttach.length + toDetach.length > 0,
    onDiscard: onClose
  });

  const save = async () => {
    if (!toAttach.length && !toDetach.length) {
      onClose();
      return;
    }
    setPending(true);
    try {
      if (toAttach.length)
        await attach.mutateAsync({ applicationId: application.id, profileIds: toAttach });
      await Promise.all(
        toDetach.map((profileId) =>
          detach.mutateAsync({ applicationId: application.id, profileId })
        )
      );
      saved("Profiles updated");
      onClose();
    } catch (error) {
      failed("Failed to update profiles", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestDiscard()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>{`Configure profiles for ${application.name}`}</DialogTitle>
          </DialogHeader>
          <form
            id="configure-application-profiles"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <Field
              label="Certificate profiles"
              description={
                !optionsPending && !options.length && !profileCreation.canCreate
                  ? "No certificate profiles exist yet. Create one in Certificate profiles first."
                  : undefined
              }
            >
              <Combobox
                multiple
                mono
                label="Certificate profiles"
                placeholder="Select profiles"
                emptyText="No certificate profiles yet"
                options={options}
                value={selected}
                onValueChange={setSelected}
                {...profileCreation.comboboxProps}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={requestDiscard} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="configure-application-profiles"
              loading={pending}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your pending profile changes will be lost."
      />
      {profileCreation.sheet}
    </>
  );
};

const ProfilesLoader = ({
  application,
  onClose
}: {
  application: TPkiApplication;
  onClose: () => void;
}) => {
  const { data, isPending } = useV4Adapter("pkiApplications").useApplicationProfiles(
    application.id
  );
  if (isPending) return null;
  return (
    <ProfilesForm
      application={application}
      initial={(data ?? []).map((profile) => profile.profileId)}
      onClose={onClose}
    />
  );
};

export const ConfigureProfilesDialog = ({
  application,
  onClose
}: {
  application?: TPkiApplication;
  onClose: () => void;
}) =>
  application ? (
    <ProfilesLoader key={application.id} application={application} onClose={onClose} />
  ) : null;
