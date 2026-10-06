import { useEffect, useRef, useState } from "react";
import { subject } from "@casl/ability";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { fetchSecretValue } from "@app/hooks/api/dashboard/queries";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { SecretType, SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";

import { CreateSecretForm, TSecretEditChanges } from "../CreateSecretForm/CreateSecretForm";
import type { SecretTableRowProps } from "./SecretTableRow";

type Props = Pick<
  SecretTableRowProps,
  "secretKey" | "secretPath" | "environments" | "getSecretByKey" | "onSecretUpdate" | "importedBy"
> & {
  onClose: () => void;
};

export const MultiEnvironmentSecretEditSheet = ({
  secretKey,
  secretPath,
  environments,
  getSecretByKey,
  onSecretUpdate,
  importedBy,
  onClose
}: Props) => {
  const { projectId } = useProject();
  const { permission } = useProjectPermission();
  const [isDirty, setIsDirty] = useState(false);
  const [selectedEnvironments, setSelectedEnvironments] = useState(environments);
  const completedUpdates = useRef(new Map<string, string>());
  const [isSaving, setIsSaving] = useState(false);
  const [initialSecrets] = useState(() =>
    environments
      .map((env) => getSecretByKey(env.slug, secretKey))
      .filter((secret): secret is SecretV3RawSanitized => Boolean(secret))
  );
  const [draft, setDraft] = useState<{
    secrets: SecretV3RawSanitized[];
    values: (string | undefined)[];
  }>();
  const [loadError, setLoadError] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    changes: TSecretEditChanges;
    environments: { name: string; slug: string }[];
  }>();
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: onClose });

  const hasPersonalOverride = selectedEnvironments.some((env) => {
    const secret = getSecretByKey(env.slug, secretKey);
    return (
      secret?.idOverride ||
      secret?.overrideAction === "created" ||
      secret?.overrideAction === "modified"
    );
  });

  const getEnvironmentError = (slug: string) => {
    const secret = getSecretByKey(slug, secretKey);
    const name = environments.find((env) => env.slug === slug)?.name ?? slug;
    if (
      !hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.DescribeSecret,
        {
          environment: slug,
          secretPath,
          secretName: secretKey,
          secretTags: secret?.tags?.map((tag) => tag.slug) ?? []
        }
      )
    )
      return `You cannot view this secret in ${name}. Remove that environment to continue.`;
    if (!secret)
      return `This secret does not exist in ${name}. Deselect that environment to continue.`;
    if (
      secret.isRotatedSecret ||
      secret.isHoneyTokenSecret ||
      secret.pendingAction === PendingAction.Delete ||
      secret.revokedProjectFolderGrant
    ) {
      return `This secret cannot be edited in ${name}. Deselect that environment to continue.`;
    }
    if (
      permission.cannot(
        ProjectPermissionSecretActions.Edit,
        subject(ProjectPermissionSub.Secrets, {
          environment: slug,
          secretPath,
          secretName: secretKey,
          secretTags: secret.tags?.map((tag) => tag.slug) ?? []
        })
      )
    )
      return `You cannot edit this secret in ${name}. Deselect that environment to continue.`;
    return undefined;
  };

  const readableEnvironmentsJson = JSON.stringify(
    initialSecrets
      .filter(
        (secret) =>
          !secret.secretValueHidden &&
          !secret.revokedProjectFolderGrant &&
          hasSecretReadValueOrDescribePermission(
            permission,
            ProjectPermissionSecretActions.ReadValue,
            {
              environment: secret.env,
              secretPath,
              secretName: secretKey,
              secretTags: secret.tags?.map((tag) => tag.slug) ?? []
            }
          )
      )
      .map((secret) => secret.env)
  );

  useEffect(() => {
    let cancelled = false;
    const secrets = initialSecrets;
    const readableEnvironments = new Set(JSON.parse(readableEnvironmentsJson) as string[]);
    Promise.all(
      secrets.map(async (secret) => {
        if (!readableEnvironments.has(secret.env)) return undefined;
        if (secret.isEmpty) return "";
        return (
          (await fetchSecretValue({ projectId, environment: secret.env, secretPath, secretKey }))
            .value ?? ""
        );
      })
    )
      .then((values) => {
        if (!cancelled) setDraft({ secrets, values });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [initialSecrets, readableEnvironmentsJson, projectId, secretPath, secretKey]);

  const common = <T,>(values: T[], fallback: T): T =>
    values.length && values.every((value) => JSON.stringify(value) === JSON.stringify(values[0]))
      ? values[0]
      : fallback;
  const selectedSecrets = selectedEnvironments.map((environment) =>
    draft?.secrets.find((secret) => secret.env === environment.slug)
  );
  const selectedValues = selectedSecrets.map((secret) =>
    secret ? draft?.values[draft.secrets.indexOf(secret)] : undefined
  );
  const comments = selectedSecrets.map((secret) => secret?.comment ?? "");
  const tags = selectedSecrets.map((secret) =>
    (secret?.tags?.map((tag) => ({ id: tag.id, slug: tag.slug })) ?? []).sort((a, b) =>
      a.id.localeCompare(b.id)
    )
  );
  const selectedTags = [...new Map(tags.flat().map((tag) => [tag.id, tag])).values()];
  const metadata = selectedSecrets.map((secret) =>
    (secret?.secretMetadata ?? [])
      .map((entry) => ({ ...entry, isEncrypted: entry.isEncrypted ?? false }))
      .sort((a, b) => a.key.localeCompare(b.key))
  );
  const encodings = selectedSecrets.map((secret) => secret?.skipMultilineEncoding ?? false);
  const commonValue = common(selectedValues, undefined);
  const commonMetadata = common(metadata, []);
  const metadataKeys = [
    ...new Set(metadata.flatMap((entries) => entries.map((entry) => entry.key)))
  ].sort();
  const differs = (values: unknown[]) =>
    values.length > 1 &&
    values.some((value) => JSON.stringify(value) !== JSON.stringify(values[0]));
  let valueWarning: string | undefined;
  if (selectedValues.some((value) => value === undefined)) {
    valueWarning =
      "Some selected values cannot be read. Leave the masked value unchanged to preserve them. Enter a replacement or delete the mask to remove the value in all selected environments when you save.";
  } else if (differs(selectedValues)) {
    valueWarning =
      "Values differ between selected environments. Leave the masked value unchanged to preserve each value. Enter a replacement or delete the mask to remove the value in all selected environments when you save.";
  }
  const mixedFields = {
    value: valueWarning,
    comment: differs(comments)
      ? "Comments differ between selected environments. The displayed comment comes from one environment. Edit or delete it to replace or remove comments in all selected environments when you save."
      : undefined,
    tags: differs(tags)
      ? "Shown tags may apply to only some selected environments. Adding or removing a tag applies that change to all selected environments; unchanged tags stay as they are. Remove every shown tag to remove all tags from the selected environments."
      : undefined,
    metadata: differs(metadata)
      ? "Metadata differs between selected environments. Edited entries apply to all selected environments; other keys and unchanged encryption settings are preserved. Use Remove Metadata Keys to remove existing keys."
      : undefined,
    skipMultilineEncoding: differs(encodings)
      ? "Multiline encoding differs between selected environments. Changing this setting applies it to all selected environments."
      : undefined
  };

  const save = async (changes: TSecretEditChanges, selected: { name: string; slug: string }[]) => {
    if (
      changes.newSecretName &&
      selected.some((env) => {
        const secret = getSecretByKey(env.slug, secretKey);
        return (
          secret?.idOverride ||
          secret?.overrideAction === "created" ||
          secret?.overrideAction === "modified"
        );
      })
    ) {
      createNotification({
        type: "error",
        text: "Remove personal overrides before renaming this secret."
      });
      return;
    }
    const collision = selected
      .map((environment) => {
        const existing = initialSecrets.find((secret) => secret.env === environment.slug);
        return {
          environment,
          entry: changes.secretMetadata?.find(
            (entry) =>
              entry.previousKey &&
              entry.previousKey !== entry.key &&
              existing?.secretMetadata?.some((metadataEntry) => metadataEntry.key === entry.key)
          )
        };
      })
      .find((candidate) => candidate.entry);
    if (collision?.entry) {
      createNotification({
        type: "error",
        text: `Metadata key "${collision.entry.key}" already exists in ${collision.environment.name}. Choose another key.`
      });
      return;
    }
    const plans = selected
      .map((environment) => {
        const { tagChanges, removedMetadataKeys, ...targetChanges } = changes;
        const existingSecret = initialSecrets.find((secret) => secret.env === environment.slug);
        if (tagChanges) {
          const entries = new Map(
            (existingSecret?.tags ?? [])
              .filter((tag) => !tagChanges.removals.includes(tag.id))
              .map((tag) => [tag.id, { id: tag.id, slug: tag.slug }])
          );
          tagChanges.additions.forEach((tag) => entries.set(tag.id, tag));
          targetChanges.tags = [...entries.values()];
        }
        if (changes.secretMetadata || removedMetadataKeys?.length) {
          const existing = existingSecret?.secretMetadata ?? [];
          const removedKeys = new Set([
            ...(removedMetadataKeys ?? []),
            ...(changes.secretMetadata ?? []).flatMap((entry) =>
              entry.previousKey && entry.previousKey !== entry.key ? [entry.previousKey] : []
            )
          ]);
          const entries = new Map(
            existing
              .filter((entry) => !removedKeys.has(entry.key))
              .map((entry) => [entry.key, entry])
          );
          changes.secretMetadata?.forEach((entry) => {
            const { previousKey, ...update } = entry;
            entries.set(entry.key, {
              ...update,
              isEncrypted:
                entry.isEncrypted ??
                entries.get(entry.key)?.isEncrypted ??
                existing.find((metadataEntry) => metadataEntry.key === previousKey)?.isEncrypted ??
                false
            });
          });
          targetChanges.secretMetadata = [...entries.values()];
        }
        return { environment, changes: targetChanges };
      })
      .filter(
        (plan) =>
          completedUpdates.current.get(plan.environment.slug) !== JSON.stringify(plan.changes)
      );
    if (!plans.length) {
      if (selected.length) onClose();
      return;
    }
    const error = plans.map((plan) => getEnvironmentError(plan.environment.slug)).find(Boolean);
    if (error) {
      createNotification({ type: "error", text: error });
      return;
    }
    setIsSaving(true);
    try {
      const results = await Promise.allSettled(
        plans.map(({ environment: env, changes: targetChanges }) => {
          const secret = getSecretByKey(env.slug, secretKey)!;
          return onSecretUpdate({
            env: env.slug,
            key: secretKey,
            value: targetChanges.value,
            secretId: secret.id,
            secretValueHidden: secret.secretValueHidden,
            type: SecretType.Shared,
            ...targetChanges
          });
        })
      );
      results.forEach((result, index) => {
        if (result.status === "fulfilled")
          completedUpdates.current.set(
            plans[index].environment.slug,
            JSON.stringify(plans[index].changes)
          );
      });
      const failedEnvironments = plans.filter((_, index) => results[index].status === "rejected");
      if (failedEnvironments.length) {
        createNotification({
          type: "error",
          text: `Could not update ${failedEnvironments.map((plan) => plan.environment.name).join(", ")}. Other selected environments may have been updated. Your draft has been kept; retrying skips unchanged successful updates.`
        });
        setConfirmation(undefined);
        return;
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (
    changes: TSecretEditChanges,
    selected: { name: string; slug: string }[]
  ) => {
    const requiresConfirmation =
      changes.value !== undefined &&
      importedBy?.some((entry) =>
        entry.folders.some((folder) =>
          folder.secrets?.some(
            (secret) =>
              secret.referencedSecretKey === secretKey &&
              selected.some((env) => env.slug === secret.referencedSecretEnv)
          )
        )
      );
    if (requiresConfirmation) {
      setConfirmation({ changes, environments: selected });
      return;
    }
    await save(changes, selected);
  };

  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open && !isSaving) requestDiscard();
        }}
      >
        <SheetContent
          className="w-full gap-y-0"
          onEscapeKeyDown={(event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target.matches('[role="combobox"][aria-expanded="true"]')
            )
              event.preventDefault();
          }}
          onOpenAutoFocus={(event) => {
            if (!draft) return;
            event.preventDefault();
            (event.target as HTMLElement)
              .querySelector<HTMLTextAreaElement>('[aria-label="secret value"]')
              ?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>Edit Secret</SheetTitle>
            <SheetDescription>
              Apply shared changes to this secret in all selected environments.
            </SheetDescription>
          </SheetHeader>
          {!draft && (
            <p className="p-4 text-sm text-muted">
              {loadError
                ? "Could not load this secret. Close the sheet and try again."
                : "Loading secret..."}
            </p>
          )}
          {draft && (
            <CreateSecretForm
              secretPath={secretPath}
              defaultSelectedEnvs={environments}
              onClose={requestDiscard}
              editSecret={{
                key: secretKey,
                value: commonValue ?? "",
                comment: common(comments, comments.find(Boolean) ?? ""),
                tags: selectedTags,
                metadata: commonMetadata,
                metadataKeys,
                skipMultilineEncoding: common(encodings, false),
                canEditButNotView: commonValue === undefined,
                isReadOnly: isSaving,
                allowRename: !hasPersonalOverride,
                renameDisabledReason: hasPersonalOverride
                  ? "Remove personal overrides before renaming this secret."
                  : undefined,
                environmentOptions: environments,
                getEnvironmentError: (slug) =>
                  completedUpdates.current.has(slug) ? undefined : getEnvironmentError(slug),
                isSharedEdit: true,
                mixedFields,
                onEnvironmentsChange: setSelectedEnvironments,
                onDirtyChange: setIsDirty,
                onSubmit: handleSubmit
              }}
            />
          )}
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your unsaved changes to this secret will be lost."
      />
      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !isSaving) setConfirmation(undefined);
        }}
        confirmationValue="confirm"
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Secret in All Selected Environments?</AlertDialogTitle>
            <AlertDialogDescription>
              These shared changes apply to all selected environments and affect secrets that
              reference the updated values.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogConfirmationField />
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="project"
              isPending={isSaving}
              onClick={(event) => {
                event.preventDefault();
                if (confirmation) save(confirmation.changes, confirmation.environments);
              }}
            >
              Save Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
