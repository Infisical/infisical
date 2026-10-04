import { useEffect, useRef, useState } from "react";
import { subject } from "@casl/ability";
import { LockKeyholeIcon } from "lucide-react";

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
  Badge,
  Button,
  DiscardChangesAlertDialog,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsList,
  TabsTrigger
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
import { SharedSecretUpdateForm } from "./SharedSecretUpdateForm";

type Props = Pick<
  SecretTableRowProps,
  "secretKey" | "secretPath" | "environments" | "getSecretByKey" | "onSecretUpdate" | "importedBy"
> & { onClose: () => void };

type Update = {
  environment: { name: string; slug: string };
  changes: TSecretEditChanges;
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
  const [mode, setMode] = useState("individual");
  const [activeEnvironment, setActiveEnvironment] = useState(environments[0]?.slug);
  const [isSaving, setIsSaving] = useState(false);
  const [sharedDirty, setSharedDirty] = useState(false);
  const [environmentDrafts, setEnvironmentDrafts] = useState<
    Record<string, { changes: TSecretEditChanges; isValid: boolean }>
  >({});
  const [initialSecrets] = useState(() =>
    environments
      .map((env) => getSecretByKey(env.slug, secretKey))
      .filter((secret): secret is SecretV3RawSanitized => Boolean(secret))
  );
  const [values, setValues] = useState<Record<string, string | undefined>>();
  const [loadError, setLoadError] = useState(false);
  const [review, setReview] = useState<Update[]>();
  const [confirmation, setConfirmation] = useState<Update[]>();
  const pendingMode = useRef<string>();
  const completedUpdates = useRef(new Map<string, string>());
  const updates = environments
    .flatMap((environment) => {
      const draft = environmentDrafts[environment.slug];
      return draft && Object.values(draft.changes).some((value) => value !== undefined)
        ? [{ environment, changes: draft.changes }]
        : [];
    })
    .filter(
      (plan) => completedUpdates.current.get(plan.environment.slug) !== JSON.stringify(plan.changes)
    );
  const isDirty = sharedDirty || updates.length > 0;
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty,
      onDiscard: () => {
        if (pendingMode.current) {
          setMode(pendingMode.current);
          pendingMode.current = undefined;
          setEnvironmentDrafts({});
          setSharedDirty(false);
          setReview(undefined);
          return;
        }
        onClose();
      }
    });
  const requestClose = () => {
    pendingMode.current = undefined;
    requestDiscard();
  };

  const canDescribe = (slug: string) => {
    const secret = getSecretByKey(slug, secretKey);
    return (
      !secret?.revokedProjectFolderGrant &&
      hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.DescribeSecret,
        {
          environment: slug,
          secretPath,
          secretName: secretKey,
          secretTags: secret?.tags?.map((tag) => tag.slug) ?? []
        }
      )
    );
  };

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
    if (!canDescribe(slug)) return `You cannot view this secret in ${name}.`;
    if (!secret) return `This secret does not exist in ${name}.`;
    if (
      secret.isRotatedSecret ||
      secret.isHoneyTokenSecret ||
      secret.pendingAction === PendingAction.Delete ||
      secret.revokedProjectFolderGrant
    )
      return `This secret cannot be edited in ${name}.`;
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
      return `You cannot edit this secret in ${name}.`;
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
    const readable = new Set(JSON.parse(readableEnvironmentsJson) as string[]);
    Promise.all(
      initialSecrets.map(async (secret) => {
        if (!readable.has(secret.env)) return [secret.env, undefined] as const;
        const value = secret.isEmpty
          ? ""
          : ((await fetchSecretValue({ projectId, environment: secret.env, secretPath, secretKey }))
              .value ?? "");
        return [secret.env, value] as const;
      })
    )
      .then((entries) => {
        if (!cancelled) setValues(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [initialSecrets, readableEnvironmentsJson, projectId, secretPath, secretKey]);

  const validateUpdates = (plans: Update[]) => {
    const error = plans.map((plan) => getEnvironmentError(plan.environment.slug)).find(Boolean);
    if (error || !plans.length) {
      createNotification({
        type: "error",
        text: error ?? "Select an environment and a field to update."
      });
      return false;
    }
    if (hasPersonalOverride && plans.some((plan) => plan.changes.newSecretName)) {
      createNotification({
        type: "error",
        text: "Remove personal overrides before renaming this secret."
      });
      return false;
    }
    return true;
  };

  const save = async (plans: Update[]) => {
    const remaining = plans.filter(
      (plan) => completedUpdates.current.get(plan.environment.slug) !== JSON.stringify(plan.changes)
    );
    if (!validateUpdates(remaining)) return;
    setIsSaving(true);
    try {
      const results = await Promise.allSettled(
        remaining.map(({ environment, changes }) => {
          const secret = getSecretByKey(environment.slug, secretKey)!;
          return onSecretUpdate({
            env: environment.slug,
            key: secretKey,
            secretId: secret.id,
            secretValueHidden: secret.secretValueHidden,
            type: SecretType.Shared,
            value: changes.value,
            ...changes
          });
        })
      );
      results.forEach((result, index) => {
        if (result.status === "fulfilled")
          completedUpdates.current.set(
            remaining[index].environment.slug,
            JSON.stringify(remaining[index].changes)
          );
      });
      const failed = remaining.filter((_, index) => results[index].status === "rejected");
      if (failed.length) {
        createNotification({
          type: "error",
          text: `Could not update ${failed.map((plan) => plan.environment.name).join(", ")}. Other targets may have been updated. Your draft has been kept; retrying will skip unchanged successful updates.`
        });
        if (review) setReview(failed);
        setConfirmation(undefined);
        return;
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (plans: Update[]) => {
    const remaining = plans.filter(
      (plan) => completedUpdates.current.get(plan.environment.slug) !== JSON.stringify(plan.changes)
    );
    if (!remaining.length) {
      onClose();
      return;
    }
    if (!validateUpdates(remaining)) return;
    const requiresConfirmation = importedBy?.some((entry) =>
      entry.folders.some((folder) =>
        folder.secrets?.some(
          (secret) =>
            secret.referencedSecretKey === secretKey &&
            remaining.some(
              (plan) =>
                plan.changes.value !== undefined &&
                plan.environment.slug === secret.referencedSecretEnv
            )
        )
      )
    );
    if (requiresConfirmation) {
      setConfirmation(remaining);
      return;
    }
    await save(remaining);
  };

  const readable = new Set(JSON.parse(readableEnvironmentsJson) as string[]);
  const valuesDiffer =
    values && new Set(Object.values(values).filter((value) => value !== undefined)).size > 1;

  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open && !isSaving) requestClose();
        }}
      >
        <SheetContent
          size="form"
          className="gap-y-0"
          onEscapeKeyDown={(event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target.matches('[role="combobox"][aria-expanded="true"]')
            ) {
              event.preventDefault();
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>Edit Secret</SheetTitle>
            <SheetDescription>
              <span className="font-mono text-foreground">{secretKey}</span> · {secretPath}
            </SheetDescription>
          </SheetHeader>
          <Tabs
            value={mode}
            className="shrink-0 p-4"
            onValueChange={(next) => {
              if (next === mode || isSaving) return;
              pendingMode.current = next;
              requestDiscard();
            }}
          >
            <TabsList variant="filled" aria-label="Editing Mode">
              <TabsTrigger value="individual" disabled={isSaving}>
                Per Environment
              </TabsTrigger>
              <TabsTrigger value="shared" disabled={isSaving}>
                Apply to Selected
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {!values && (
            <p className="p-4 text-sm text-muted">
              {loadError
                ? "Could not load this secret. Close the sheet and try again."
                : "Loading secret..."}
            </p>
          )}
          {values && mode === "individual" && (
            <>
              <div className="px-4 pb-4">
                <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                  {environments.map((environment) => {
                    const secret = initialSecrets.find((item) => item.env === environment.slug);
                    const error = getEnvironmentError(environment.slug);
                    const changed = updates.some(
                      (plan) => plan.environment.slug === environment.slug
                    );
                    const annotations = [
                      secret?.comment ? "Comment" : undefined,
                      secret?.tags?.length
                        ? `${secret.tags.length} tag${secret.tags.length === 1 ? "" : "s"}`
                        : undefined,
                      secret?.secretMetadata?.length
                        ? `${secret.secretMetadata.length} metadata entr${secret.secretMetadata.length === 1 ? "y" : "ies"}`
                        : undefined
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    let detail = "Unavailable";
                    if (canDescribe(environment.slug))
                      detail = secret ? annotations || "No annotations" : "Secret not present";
                    let status = readable.has(environment.slug)
                      ? "Can Read and Modify"
                      : "Can Modify · Value Hidden";
                    if (error)
                      status =
                        canDescribe(environment.slug) && secret ? "Read-Only" : "Unavailable";
                    return (
                      <Button
                        key={environment.slug}
                        variant="ghost"
                        isDisabled={isSaving}
                        aria-pressed={activeEnvironment === environment.slug}
                        onClick={() => setActiveEnvironment(environment.slug)}
                        className={`h-auto w-full justify-between rounded-none border-b border-border px-3 py-2.5 last:border-b-0 ${activeEnvironment === environment.slug ? "bg-container" : ""}`}
                      >
                        <span className="min-w-0 text-left">
                          <span className="block truncate">{environment.name}</span>
                          <span className="block truncate text-xs text-muted">{detail}</span>
                        </span>
                        <Badge variant={changed ? "project" : "outline"}>
                          {error && <LockKeyholeIcon />}
                          {changed ? "Unsaved Changes" : status}
                        </Badge>
                      </Button>
                    );
                  })}
                </div>
                {valuesDiffer && (
                  <p className="mt-2 text-xs text-muted">
                    Readable values differ. Each environment keeps its own value unless you change
                    it.
                  </p>
                )}
              </div>
              {environments.map((environment) => {
                const secret = initialSecrets.find((item) => item.env === environment.slug);
                const error = getEnvironmentError(environment.slug);
                return (
                  <div
                    key={environment.slug}
                    className={
                      activeEnvironment === environment.slug
                        ? "flex min-h-0 flex-1 flex-col"
                        : "hidden"
                    }
                  >
                    <div className="px-4">
                      <p className="text-sm">{environment.name}</p>
                      {error && <p className="mt-1 text-xs text-muted">{error}</p>}
                    </div>
                    {secret && canDescribe(environment.slug) ? (
                      <CreateSecretForm
                        secretPath={secretPath}
                        defaultSelectedEnvs={[environment]}
                        onClose={requestClose}
                        editSecret={{
                          key: secretKey,
                          value: readable.has(environment.slug)
                            ? (values[environment.slug] ?? "")
                            : "",
                          comment: secret.comment,
                          tags: secret.tags?.map((tag) => ({ id: tag.id, slug: tag.slug })),
                          metadata: secret.secretMetadata,
                          skipMultilineEncoding: secret.skipMultilineEncoding,
                          allowRename: false,
                          canEditButNotView: !readable.has(environment.slug),
                          isReadOnly: isSaving || Boolean(error),
                          hideIdentityFields: true,
                          hideFooter: true,
                          explicitValueAction: true,
                          inputIdPrefix: `edit-${environment.slug}`,
                          onDraftChange: (changes, isValid) =>
                            setEnvironmentDrafts((current) => {
                              const next = { changes, isValid };
                              return JSON.stringify(current[environment.slug]) ===
                                JSON.stringify(next)
                                ? current
                                : { ...current, [environment.slug]: next };
                            }),
                          onSubmit: async () => {
                            if (
                              updates.every(
                                (plan) => environmentDrafts[plan.environment.slug]?.isValid
                              )
                            )
                              await handleSubmit(updates);
                          }
                        }}
                      />
                    ) : (
                      <p className="p-4 text-sm text-muted">
                        Select an available environment to inspect this secret. Missing secrets will
                        not be created.
                      </p>
                    )}
                  </div>
                );
              })}
              <SheetFooter className="shrink-0 flex-col border-t">
                <p className="text-xs text-muted">
                  {updates.length
                    ? `${updates.length} environment${updates.length === 1 ? "" : "s"} changed: ${updates.map((plan) => plan.environment.name).join(", ")}. Only changed fields will be saved.`
                    : "No changes. Editing one environment leaves the others untouched."}
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" isDisabled={isSaving} onClick={requestClose}>
                    Cancel
                  </Button>
                  <Button
                    variant="project"
                    isPending={isSaving}
                    isDisabled={
                      !updates.length ||
                      updates.some(
                        (plan) =>
                          !environmentDrafts[plan.environment.slug]?.isValid ||
                          getEnvironmentError(plan.environment.slug)
                      )
                    }
                    onClick={() => handleSubmit(updates)}
                  >
                    Save Changes
                  </Button>
                </div>
              </SheetFooter>
            </>
          )}
          {values && mode === "shared" && (
            <>
              <div className={review ? "hidden" : "flex min-h-0 flex-1 flex-col"}>
                <SharedSecretUpdateForm
                  secretKey={secretKey}
                  environments={environments}
                  secrets={initialSecrets.filter((secret) => canDescribe(secret.env))}
                  getEnvironmentError={getEnvironmentError}
                  allowRename={!hasPersonalOverride}
                  isSaving={isSaving}
                  onDirtyChange={setSharedDirty}
                  onClose={requestClose}
                  onSubmit={async (plans) => {
                    if (validateUpdates(plans)) setReview(plans);
                  }}
                />
              </div>
              {review && (
                <>
                  <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
                    <h3 className="text-sm">Review Updates</h3>
                    <p className="text-xs text-muted">
                      Only these fields and environments will change. Unlisted fields and
                      environments keep their existing data.
                    </p>
                    {review.map(({ environment, changes }) => (
                      <div key={environment.slug} className="rounded-md border border-border p-3">
                        <p className="mb-2 text-sm">{environment.name}</p>
                        <ul className="space-y-1 text-xs text-muted">
                          {changes.newSecretName !== undefined && (
                            <li>Rename to {changes.newSecretName}</li>
                          )}
                          {changes.value !== undefined && (
                            <li className={changes.value === "" ? "text-warning" : undefined}>
                              {changes.value === ""
                                ? "Set an empty value; the secret will not be deleted"
                                : "Replace value"}
                            </li>
                          )}
                          {changes.secretComment !== undefined && (
                            <li>{changes.secretComment ? "Replace comment" : "Remove comment"}</li>
                          )}
                          {changes.tags !== undefined && (
                            <li>
                              Tags after update:{" "}
                              {changes.tags.map((tag) => tag.slug).join(", ") || "None"}
                            </li>
                          )}
                          {changes.secretMetadata !== undefined && (
                            <li>
                              Metadata keys after update:{" "}
                              {changes.secretMetadata.map((entry) => entry.key).join(", ") ||
                                "None"}
                            </li>
                          )}
                          {changes.skipMultilineEncoding !== undefined && (
                            <li>
                              {changes.skipMultilineEncoding ? "Disable" : "Enable"} multiline
                              encoding
                            </li>
                          )}
                        </ul>
                        {getEnvironmentError(environment.slug) && (
                          <p className="mt-2 text-xs text-danger">
                            {getEnvironmentError(environment.slug)}
                          </p>
                        )}
                      </div>
                    ))}
                    <p className="text-xs text-muted">
                      Existing approval policies still apply. Updates are submitted separately; some
                      targets can succeed while others fail.
                    </p>
                  </div>
                  <SheetFooter className="shrink-0 justify-between border-t">
                    <Button
                      variant="ghost"
                      isDisabled={isSaving}
                      onClick={() => setReview(undefined)}
                    >
                      Back
                    </Button>
                    <Button
                      variant="project"
                      isPending={isSaving}
                      isDisabled={review.some((plan) =>
                        Boolean(getEnvironmentError(plan.environment.slug))
                      )}
                      onClick={() => handleSubmit(review)}
                    >
                      Apply {review.length} Update{review.length === 1 ? "" : "s"}
                    </Button>
                  </SheetFooter>
                </>
              )}
            </>
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
            <AlertDialogTitle>Update Referenced Secrets?</AlertDialogTitle>
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
                if (confirmation) save(confirmation);
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
