/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useCallback, useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  CircleAlertIcon,
  ClipboardCheckIcon,
  EyeIcon,
  FolderIcon,
  KeyRoundIcon,
  SaveIcon,
  TriangleAlertIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Tooltip } from "@app/components/v2";
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  UnstableInput
} from "@app/components/v3";
import { dashboardKeys, fetchSecretValue } from "@app/hooks/api/dashboard/queries";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { fetchSecretReferences, secretKeys } from "@app/hooks/api/secrets/queries";
import { SecretVersionDiffView } from "@app/pages/secret-manager/CommitDetailsPage/components/SecretVersionDiffView";
import { HIDDEN_SECRET_VALUE_API_MASK } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

import {
  PendingChange,
  PendingChanges,
  PendingSecretDelete,
  PendingSecretUpdate,
  useBatchMode,
  useBatchModeActions
} from "../../SecretMainPage.store";

interface CommitFormProps {
  onCommit: (changes: PendingChanges, commitMessage: string) => Promise<void>;
  isCommitting?: boolean;
  environment: string;
  projectId: string;
  secretPath: string;
  isReviewOpen?: boolean;
  onReviewOpenChange?: (isOpen: boolean) => void;
}

/* eslint-disable react/no-unused-prop-types */
type RenderResourceProps = {
  onDiscard: () => void;
  change: PendingChange;
  referenceCount?: number;
  onRevealOldValue?: () => Promise<void>;
  onRevealNewValue?: () => Promise<void>;
  isLoadingOldValue?: boolean;
  isLoadingNewValue?: boolean;
};
/* eslint-enable react/no-unused-prop-types */

const RenderSecretChanges = ({
  onDiscard,
  change,
  referenceCount,
  onRevealOldValue,
  onRevealNewValue,
  isLoadingOldValue,
  isLoadingNewValue
}: RenderResourceProps) => {
  if (change.resourceType !== "secret") return null;

  if (change.type === PendingAction.Create) {
    return (
      <SecretVersionDiffView
        showViewed
        onDiscard={onDiscard}
        onRevealNewValue={onRevealNewValue}
        isLoadingNewValue={isLoadingNewValue}
        item={{
          secretKey: change.secretKey,
          isAdded: true,
          type: "secret",
          id: change.id,
          versions: [
            {
              version: 1, // placeholder, not used
              secretKey: change.secretKey,
              secretValue: change.secretValue,
              tags: change.tags?.map((tag) => tag.slug),
              secretMetadata: change.secretMetadata,
              skipMultilineEncoding: change.skipMultilineEncoding,
              comment: change.secretComment
            }
          ]
        }}
      />
    );
  }

  if (change.type === PendingAction.Update) {
    const { existingSecret } = change;

    const hasKeyChange = change.newSecretName && change.secretKey !== change.newSecretName;
    const hasValueChange = change.secretValue !== change.originalValue;
    const hasCommentChange = change.secretComment !== change.originalComment;
    const hasMultilineChange =
      change.skipMultilineEncoding !== change.originalSkipMultilineEncoding;
    const hasTagsChange = JSON.stringify(change.tags) !== JSON.stringify(change.originalTags);
    const hasMetadataChange =
      JSON.stringify(change.secretMetadata) !== JSON.stringify(change.originalSecretMetadata);

    const hasChanges = [
      hasKeyChange,
      hasValueChange,
      hasCommentChange,
      hasMultilineChange,
      hasTagsChange,
      hasMetadataChange
    ].some(Boolean);

    if (!hasChanges) return null;

    const showReferenceWarning = hasKeyChange && referenceCount && referenceCount > 0;

    const referenceWarningElement = showReferenceWarning ? (
      <Tooltip
        content={
          <div className="max-w-xs">
            <p className="font-medium">References will be updated</p>
            <p className="mt-1 text-xs text-mineshaft-300">
              This secret is referenced by {referenceCount} secret{referenceCount !== 1 ? "s" : ""}.
              References will be automatically updated to use the new key. This can trigger secret
              syncs in the respective environments.
            </p>
          </div>
        }
      >
        <Badge variant="warning" className="ml-2">
          <TriangleAlertIcon className="size-3" /> References affected
        </Badge>
      </Tooltip>
    ) : undefined;

    // Determine original value: use fetched value, or show mask if not fetched yet
    const originalSecretValue = change.existingSecret.secretValueHidden
      ? HIDDEN_SECRET_VALUE_API_MASK
      : (change.originalValue ?? existingSecret.value ?? HIDDEN_SECRET_VALUE_API_MASK);

    // Determine new value: use modified value, or fall back to original
    const newSecretValue = change.secretValue ?? change.originalValue ?? originalSecretValue;

    return (
      <SecretVersionDiffView
        showViewed
        onDiscard={onDiscard}
        headerExtra={referenceWarningElement}
        onRevealOldValue={onRevealOldValue}
        onRevealNewValue={onRevealNewValue}
        isLoadingOldValue={isLoadingOldValue}
        isLoadingNewValue={isLoadingNewValue}
        item={{
          secretKey: change.secretKey,
          isUpdated: true,
          type: "secret",
          id: change.id,
          versions: [
            {
              version: 1, // placeholder, not used
              secretKey: existingSecret.key,
              secretValue: originalSecretValue,
              secretValueHidden: change.existingSecret.secretValueHidden,
              tags: existingSecret.tags?.map((tag) => tag.slug) ?? [],
              secretMetadata: existingSecret.secretMetadata,
              skipMultilineEncoding: existingSecret.skipMultilineEncoding,
              comment: existingSecret.comment
            },
            {
              version: 2, // placeholder, not used
              secretKey: change.newSecretName ?? existingSecret.key,
              secretValue: newSecretValue,
              secretValueHidden: change.existingSecret.secretValueHidden && !hasValueChange,
              tags:
                change.tags?.map((tag) => tag.slug) ??
                existingSecret.tags?.map((tag) => tag.slug) ??
                [],
              secretMetadata: change.secretMetadata ?? existingSecret.secretMetadata,
              skipMultilineEncoding:
                change.skipMultilineEncoding ?? existingSecret.skipMultilineEncoding,
              comment: change.secretComment ?? existingSecret.comment
            }
          ]
        }}
      />
    );
  }

  if (change.type === PendingAction.Delete) {
    const {
      secretKey,
      secretValue,
      secretValueHidden,
      tags,
      secretMetadata,
      skipMultilineEncoding,
      comment
    } = change;
    const getDeleteSecretValue = () => {
      if (secretValueHidden) {
        return HIDDEN_SECRET_VALUE_API_MASK;
      }
      return secretValue;
    };

    return (
      <SecretVersionDiffView
        showViewed
        onDiscard={onDiscard}
        onRevealOldValue={onRevealOldValue}
        isLoadingOldValue={isLoadingOldValue}
        item={{
          secretKey: change.secretKey,
          isDeleted: true,
          type: "secret",
          id: change.id,
          versions: [
            {
              version: 1, // placeholder, not used
              secretKey,
              secretValue: getDeleteSecretValue(),
              secretValueHidden,
              tags: tags?.map((tag) => tag.slug),
              secretMetadata,
              skipMultilineEncoding,
              comment
            }
          ]
        }}
      />
    );
  }

  return null;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RenderFolderChanges = ({ onDiscard, change, referenceCount: _ }: RenderResourceProps) => {
  if (change.resourceType !== "folder") return null;

  if (change.type === PendingAction.Create) {
    return (
      <SecretVersionDiffView
        showViewed
        onDiscard={onDiscard}
        item={{
          folderName: change.folderName,
          isAdded: true,
          type: "folder",
          id: change.id,
          versions: [
            {
              version: 1,
              name: change.folderName,
              description: change.description
            }
          ]
        }}
      />
    );
  }

  if (change.type === PendingAction.Update) {
    const hasNameChange = change.folderName !== change.originalFolderName;
    const hasDescriptionChange = change.description !== change.originalDescription;

    const hasChanges = [hasNameChange, hasDescriptionChange].some(Boolean);

    if (!hasChanges) return null;

    return (
      <SecretVersionDiffView
        showViewed
        onDiscard={onDiscard}
        item={{
          folderName: change.folderName,
          isUpdated: true,
          type: "folder",
          id: change.id,
          versions: [
            {
              version: 1, // placeholder, not used
              name: change.folderName ? change.originalFolderName : undefined,
              description: change.description ? change.originalDescription : undefined
            },
            {
              version: 2, // placeholder, not used
              name: change.folderName,
              description: change.description
            }
          ]
        }}
      />
    );
  }

  if (change.type === PendingAction.Delete) {
    return (
      <SecretVersionDiffView
        showViewed
        onDiscard={onDiscard}
        item={{
          folderName: change.folderName,
          isDeleted: true,
          type: "folder",
          id: change.id,
          versions: [
            {
              version: 1,
              name: change.folderName
            }
          ]
        }}
      />
    );
  }

  return null;
};

interface ResourceChangeProps {
  change: PendingChange;
  environment: string;
  projectId: string;
  secretPath: string;
  referenceCountMap: Record<string, number>;
}

const ResourceChange: React.FC<ResourceChangeProps> = ({
  change,
  environment,
  projectId,
  secretPath,
  referenceCountMap
}) => {
  const queryClient = useQueryClient();
  const { removePendingChange, updatePendingChangeValue } = useBatchModeActions();
  const [isLoadingValue, setIsLoadingValue] = useState(false);

  const handleDeletePending = useCallback(
    (changeType: string, id: string) => {
      removePendingChange(id, changeType, {
        projectId,
        environment,
        secretPath
      });
    },
    [removePendingChange, projectId, environment, secretPath]
  );

  // Handler to fetch and reveal secret value when eye icon is clicked
  const handleRevealValue = useCallback(async () => {
    if (change.resourceType !== "secret") return;
    if (change.type !== PendingAction.Update && change.type !== PendingAction.Delete) return;

    // Determine if value is already fetched and if user has permission
    let hasValue = false;
    let canFetchValue = false;
    let secretKey = "";
    let isOverride = false;

    if (change.type === PendingAction.Update) {
      const updateChange = change as PendingSecretUpdate;
      hasValue =
        updateChange.originalValue !== undefined &&
        updateChange.originalValue !== HIDDEN_SECRET_VALUE_API_MASK;
      canFetchValue = !updateChange.existingSecret.secretValueHidden;
      secretKey = updateChange.secretKey;
      isOverride = Boolean(updateChange.existingSecret.idOverride);
    } else {
      const deleteChange = change as PendingSecretDelete;
      hasValue =
        deleteChange.secretValue !== undefined &&
        deleteChange.secretValue !== HIDDEN_SECRET_VALUE_API_MASK;
      canFetchValue = !deleteChange.secretValueHidden;
      secretKey = deleteChange.secretKey;
    }

    if (hasValue || !canFetchValue) return;

    setIsLoadingValue(true);
    try {
      const fetchParams = {
        environment,
        secretPath,
        secretKey,
        projectId,
        isOverride
      };

      const fetchedValue = await fetchSecretValue(fetchParams);

      if (fetchedValue) {
        queryClient.setQueryData(dashboardKeys.getSecretValue(fetchParams), fetchedValue);

        if (change.type === PendingAction.Update) {
          const updateChange = change as PendingSecretUpdate;
          updatePendingChangeValue(
            change.id,
            {
              originalValue: fetchedValue.value,
              secretValue: updateChange.secretValue ?? fetchedValue.value
            },
            { projectId, environment, secretPath }
          );
        } else {
          updatePendingChangeValue(
            change.id,
            { secretValue: fetchedValue.value },
            { projectId, environment, secretPath }
          );
        }
      }
    } catch {
      createNotification({
        type: "error",
        text: "Failed to fetch secret value"
      });
    } finally {
      setIsLoadingValue(false);
    }
  }, [change, environment, secretPath, projectId, queryClient, updatePendingChangeValue]);

  const referenceCount =
    change.resourceType === "secret" &&
    change.type === PendingAction.Update &&
    change.newSecretName &&
    change.secretKey !== change.newSecretName
      ? referenceCountMap[change.secretKey] || 0
      : 0;

  return change.resourceType === "secret" ? (
    <RenderSecretChanges
      key={change.id}
      change={change}
      onDiscard={() => handleDeletePending(change.resourceType, change.id)}
      referenceCount={referenceCount}
      onRevealOldValue={handleRevealValue}
      onRevealNewValue={handleRevealValue}
      isLoadingOldValue={isLoadingValue}
      isLoadingNewValue={isLoadingValue}
    />
  ) : (
    <RenderFolderChanges
      key={change.id}
      change={change}
      onDiscard={() => handleDeletePending(change.resourceType, change.id)}
    />
  );
};

export const CommitForm: React.FC<CommitFormProps> = ({
  onCommit,
  isCommitting = false,
  environment,
  projectId,
  secretPath,
  isReviewOpen: externalIsReviewOpen,
  onReviewOpenChange
}) => {
  const { isBatchMode, pendingChanges, totalChangesCount } = useBatchMode();

  const [internalIsModalOpen, setInternalIsModalOpen] = useState(false);
  const isModalOpen = externalIsReviewOpen ?? internalIsModalOpen;
  const setIsModalOpen = (open: boolean) => {
    if (onReviewOpenChange) {
      onReviewOpenChange(open);
    }
    setInternalIsModalOpen(open);
  };
  const [commitMessage, setCommitMessage] = useState("");
  const { clearAllPendingChanges } = useBatchModeActions();

  const secretsBeingRenamed = useMemo(
    () =>
      pendingChanges.secrets
        .filter(
          (change) =>
            change.type === PendingAction.Update &&
            change.newSecretName &&
            change.secretKey !== change.newSecretName
        )
        .map((change) => change.secretKey),
    [pendingChanges.secrets]
  );

  const referenceQueries = useQueries({
    queries: secretsBeingRenamed.map((secretKey) => ({
      queryKey: secretKeys.getSecretReferences({
        secretKey,
        secretPath,
        environment,
        projectId
      }),
      queryFn: () =>
        fetchSecretReferences({
          secretKey,
          secretPath,
          environment,
          projectId
        }),
      enabled: isModalOpen && secretsBeingRenamed.length > 0
    }))
  });

  const referenceCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    secretsBeingRenamed.forEach((secretKey, idx) => {
      const queryResult = referenceQueries[idx];
      if (queryResult?.data?.tree) {
        // Count direct references from tree children
        map[secretKey] = queryResult.data.tree.children?.length ?? 0;
      }
    });
    return map;
  }, [secretsBeingRenamed, referenceQueries]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const isBusy = isCommitting || isSubmitting;

  if (!isBatchMode || totalChangesCount === 0) {
    return null;
  }

  const handleCommit = async () => {
    if (isBusy) return;
    setIsSubmitting(true);
    try {
      await onCommit(pendingChanges, commitMessage);
      clearAllPendingChanges({
        projectId,
        environment,
        secretPath
      });
      setIsModalOpen(false);
      setCommitMessage("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveChanges = () => {
    setIsModalOpen(true);
  };

  return (
    <>
      {/* Floating Bottom Banner */}
      {!isModalOpen && (
        <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2">
          <AnimatePresence mode="wait">
            <motion.div
              key="commit-panel"
              transition={{ duration: 0.3 }}
              initial={{ opacity: 0, translateY: 30 }}
              animate={{ opacity: 1, translateY: 0 }}
              exit={{ opacity: 0, translateY: -30 }}
            >
              <div className="rounded-md border border-project/30 bg-card shadow-2xl backdrop-blur-md">
                <div className="flex items-center justify-between bg-project/5 px-4 py-3">
                  <div className="flex items-center gap-3 text-sm text-foreground">
                    <CircleAlertIcon className="size-4 shrink-0 text-project/85" />
                    <span>
                      <span className="font-semibold">
                        {totalChangesCount} pending change
                        {totalChangesCount !== 1 ? "s" : ""}
                      </span>
                      {" — "}
                      Review your changes before applying them to the environment.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => clearAllPendingChanges({ projectId, environment, secretPath })}
                    >
                      Discard
                    </Button>
                    <Button variant="outline" size="xs" onClick={handleSaveChanges}>
                      <EyeIcon />
                      Review
                    </Button>
                    <Button
                      variant="project"
                      size="xs"
                      onClick={handleCommit}
                      isDisabled={isBusy}
                      isPending={isBusy}
                    >
                      <SaveIcon />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Review Sheet */}
      <Sheet open={isModalOpen} onOpenChange={setIsModalOpen}>
        <SheetContent className="w-full gap-y-0 sm:max-w-8xl">
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center gap-2">
              Review Changes
              <Badge variant="warning">
                <ClipboardCheckIcon />
                {totalChangesCount} Change{totalChangesCount !== 1 ? "s" : ""}
              </Badge>
            </SheetTitle>
            <SheetDescription>
              Write a commit message and review the changes you&apos;re about to save.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
            {/* Folder Changes */}
            {pendingChanges.folders.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
                  <FolderIcon className="size-4 text-accent" />
                  <span className="flex-1 text-xs font-semibold tracking-wider text-accent uppercase">
                    Folders
                  </span>
                  <Badge variant="neutral">{pendingChanges.folders.length}</Badge>
                </div>
                <div className="space-y-2">
                  {pendingChanges.folders.map((change) => (
                    <ResourceChange
                      key={change.id}
                      change={change}
                      environment={environment}
                      projectId={projectId}
                      secretPath={secretPath}
                      referenceCountMap={referenceCountMap}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Secret Changes */}
            {pendingChanges.secrets.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
                  <KeyRoundIcon className="size-4 text-accent" />
                  <span className="flex-1 text-xs font-semibold tracking-wider text-accent uppercase">
                    Secrets
                  </span>
                  <Badge variant="neutral">{pendingChanges.secrets.length}</Badge>
                </div>
                <div className="space-y-2">
                  {pendingChanges.secrets.map((change) => (
                    <ResourceChange
                      key={change.id}
                      change={change}
                      environment={environment}
                      projectId={projectId}
                      secretPath={secretPath}
                      referenceCountMap={referenceCountMap}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <SheetFooter className="border-t border-border">
            <div className="flex w-full flex-col gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Commit Message</label>
                <UnstableInput
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Describe your changes..."
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setIsModalOpen(false)} isDisabled={isBusy}>
                  Cancel
                </Button>
                <Button
                  variant="project"
                  onClick={handleCommit}
                  isPending={isBusy}
                  isDisabled={isBusy}
                >
                  <SaveIcon />
                  {isBusy ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
};
