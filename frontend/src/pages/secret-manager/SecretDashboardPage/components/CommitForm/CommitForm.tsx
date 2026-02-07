/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useCallback, useMemo, useState } from "react";
import {
  faCodeCommit,
  faExclamationTriangle,
  faFolder,
  faKey,
  faSave
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardCheckIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Button, Input, Modal, ModalContent, Tooltip } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { dashboardKeys, fetchSecretValue } from "@app/hooks/api/dashboard/queries";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { fetchSecretReferences, secretKeys } from "@app/hooks/api/secrets/queries";
import { SecretVersionDiffView } from "@app/pages/secret-manager/CommitDetailsPage/components/SecretVersionDiffView";
import { HIDDEN_SECRET_VALUE_API_MASK } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

import {
  PendingChange,
  PendingChanges,
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
          References affected <FontAwesomeIcon icon={faExclamationTriangle} />
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
              secretValueHidden: change.existingSecret.secretValueHidden,
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
    return (
      <SecretVersionDiffView
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
              // eslint-disable-next-line no-nested-ternary
              secretValue: secretValue
                ? secretValueHidden
                  ? HIDDEN_SECRET_VALUE_API_MASK
                  : secretValue
                : undefined,
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
    if (change.resourceType !== "secret" || change.type !== PendingAction.Update) return;

    const updateChange = change as PendingSecretUpdate;

    // Check if value is already fetched
    const hasOriginalValue =
      updateChange.originalValue !== undefined &&
      updateChange.originalValue !== HIDDEN_SECRET_VALUE_API_MASK;

    // Check if user has permission to view
    const canFetchValue = !updateChange.existingSecret.secretValueHidden;

    if (hasOriginalValue || !canFetchValue) {
      // Already fetched or no permission - nothing to do
      return;
    }

    setIsLoadingValue(true);
    try {
      const fetchParams = {
        environment,
        secretPath,
        secretKey: updateChange.secretKey,
        projectId,
        isOverride: Boolean(updateChange.existingSecret.idOverride)
      };

      const fetchedValue = await fetchSecretValue(fetchParams);

      if (fetchedValue) {
        queryClient.setQueryData(dashboardKeys.getSecretValue(fetchParams), fetchedValue);

        // Update the pending change with the fetched value
        updatePendingChangeValue(
          change.id,
          {
            originalValue: fetchedValue.value,
            secretValue: updateChange.secretValue ?? fetchedValue.value
          },
          { projectId, environment, secretPath }
        );
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
  secretPath
}) => {
  const { isBatchMode, pendingChanges, totalChangesCount } = useBatchMode();

  const [isModalOpen, setIsModalOpen] = useState(false);
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
      if (queryResult?.data) {
        map[secretKey] = queryResult.data.totalCount;
      }
    });
    return map;
  }, [secretsBeingRenamed, referenceQueries]);

  if (!isBatchMode || totalChangesCount === 0) {
    return null;
  }

  const handleCommit = async () => {
    await onCommit(pendingChanges, commitMessage);
    clearAllPendingChanges({
      projectId,
      environment,
      secretPath
    });
    setIsModalOpen(false);
    setCommitMessage("");
  };

  const handleSaveChanges = () => {
    setIsModalOpen(true);
  };

  return (
    <>
      {/* Floating Panel */}
      {!isModalOpen && (
        <div className="fixed bottom-4 left-1/2 z-40 w-full max-w-3xl -translate-x-1/2 self-center lg:left-auto lg:translate-x-0">
          <AnimatePresence mode="wait">
            <motion.div
              key="commit-panel"
              transition={{ duration: 0.3 }}
              initial={{ opacity: 0, translateY: 30 }}
              animate={{ opacity: 1, translateY: 0 }}
              exit={{ opacity: 0, translateY: -30 }}
            >
              <div className="rounded-lg border border-yellow/30 bg-mineshaft-800 shadow-2xl">
                <div className="flex items-center justify-between p-4">
                  {/* Left Content */}
                  <div className="flex-1">
                    {/* Header */}
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-warning" />
                      <span className="font-medium text-mineshaft-100">Pending Changes</span>
                      <Badge variant="warning">
                        {totalChangesCount} Change{totalChangesCount !== 1 ? "s" : ""}
                      </Badge>
                    </div>

                    {/* Description */}
                    <p className="text-sm leading-5 text-mineshaft-400">
                      Review pending changes and commit them to apply the updates.
                    </p>
                  </div>

                  {/* Right Buttons */}
                  <div className="mt-0.5 ml-6 flex items-center gap-3">
                    <Button
                      size="sm"
                      onClick={() => clearAllPendingChanges({ projectId, environment, secretPath })}
                      isDisabled={totalChangesCount === 0}
                      variant="outline_bg"
                      className="px-4 hover:border-red/40 hover:bg-red/10"
                    >
                      Discard
                    </Button>
                    <Button
                      variant="solid"
                      leftIcon={<FontAwesomeIcon icon={faSave} />}
                      onClick={handleSaveChanges}
                      isDisabled={totalChangesCount === 0 || isCommitting}
                      className="px-6"
                    >
                      Save Changes
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Commit Modal */}
      <Modal isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
        <ModalContent
          title={
            <div className="flex items-center gap-2">
              Review Changes
              <Badge variant="warning">
                <ClipboardCheckIcon />
                {totalChangesCount} Change{totalChangesCount !== 1 ? "s" : ""}
              </Badge>
            </div>
          }
          subTitle="Write a commit message and review the changes you're about to save."
          className="flex h-[calc(100vh-1rem)] max-w-[95%] flex-col md:max-w-8xl"
          bodyClassName="flex flex-1 flex-col overflow-hidden !max-h-none"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-4">
                {/* Folder Changes */}
                {pendingChanges.folders.length > 0 && (
                  <div>
                    <h4 className="mb-4 flex items-center gap-2 border-b border-mineshaft-700 pb-2 text-sm font-medium text-mineshaft-200">
                      <FontAwesomeIcon icon={faFolder} className="text-mineshaft-300" />
                      Folders ({pendingChanges.folders.length})
                    </h4>
                    <div>
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
                    <h4 className="mb-4 flex items-center gap-2 border-b border-mineshaft-700 pb-2 text-sm font-medium text-mineshaft-200">
                      <FontAwesomeIcon icon={faKey} className="mr-1 text-mineshaft-300" />
                      Secrets ({pendingChanges.secrets.length})
                    </h4>
                    <div>
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
            </div>

            <div className="shrink-0 space-y-4 border-t border-mineshaft-600 pt-4">
              {/* Commit Message */}
              <div>
                <label className="mb-2 block text-sm font-medium text-mineshaft-200">
                  Commit Message
                </label>
                <Input
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Describe your changes..."
                  className="w-full"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  variant="plain"
                  colorSchema="secondary"
                  onClick={() => setIsModalOpen(false)}
                  isDisabled={isCommitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCommit}
                  isLoading={isCommitting}
                  isDisabled={isCommitting}
                  leftIcon={<FontAwesomeIcon icon={faCodeCommit} />}
                  colorSchema="primary"
                  variant="outline_bg"
                >
                  {isCommitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
};
