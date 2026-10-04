import { useEffect, useState } from "react";
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

  const hasPersonalOverride = environments.some((env) => {
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

  const save = async (changes: TSecretEditChanges, selected: { name: string; slug: string }[]) => {
    if (changes.newSecretName && hasPersonalOverride) {
      createNotification({
        type: "error",
        text: "Remove personal overrides before renaming this secret."
      });
      return;
    }
    const error = selected.map((env) => getEnvironmentError(env.slug)).find(Boolean);
    if (error || selected.length === 0) {
      createNotification({ type: "error", text: error ?? "Select an environment to update." });
      return;
    }
    setIsSaving(true);
    try {
      const results = await Promise.allSettled(
        selected.map((env) => {
          const secret = getSecretByKey(env.slug, secretKey)!;
          return onSecretUpdate({
            env: env.slug,
            key: secretKey,
            value: changes.value,
            secretId: secret.id,
            secretValueHidden: secret.secretValueHidden,
            type: SecretType.Shared,
            ...changes
          });
        })
      );
      const failedEnvironments = selected.filter(
        (_, index) => results[index].status === "rejected"
      );
      if (failedEnvironments.length) {
        createNotification({
          type: "error",
          text: `Could not update ${failedEnvironments.map((env) => env.name).join(", ")}. Other selected environments may have been updated. Your draft has been kept.`
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

  const common = <T,>(values: T[], fallback: T): T =>
    values.length && values.every((value) => JSON.stringify(value) === JSON.stringify(values[0]))
      ? values[0]
      : fallback;
  const commonValue = draft ? common(draft.values, undefined) : undefined;

  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open && !isSaving) requestDiscard();
        }}
      >
        <SheetContent
          className="gap-y-0"
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
            <SheetDescription>Update this secret in the selected environments.</SheetDescription>
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
                comment: common(
                  draft.secrets.map((secret) => secret.comment ?? ""),
                  ""
                ),
                tags: common(
                  draft.secrets.map(
                    (secret) => secret.tags?.map((tag) => ({ id: tag.id, slug: tag.slug })) ?? []
                  ),
                  []
                ),
                metadata: common(
                  draft.secrets.map((secret) => secret.secretMetadata ?? []),
                  []
                ),
                skipMultilineEncoding: common(
                  draft.secrets.map((secret) => secret.skipMultilineEncoding ?? false),
                  false
                ),
                canEditButNotView: commonValue === undefined,
                isReadOnly: isSaving,
                allowRename: !hasPersonalOverride,
                renameDisabledReason: hasPersonalOverride
                  ? "Remove personal overrides before renaming this secret."
                  : undefined,
                environmentOptions: environments,
                getEnvironmentError,
                hasMixedFields: true,
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
            <AlertDialogTitle>Update this secret?</AlertDialogTitle>
            <AlertDialogDescription>
              This secret is referenced by other secrets. Saving these changes will update
              everywhere it&apos;s referenced.
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
