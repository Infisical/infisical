/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useCallback, useState } from "react";
import { faCodeCommit, faFolder, faKey, faSave } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardCheckIcon } from "lucide-react";

import { Button, Input, Modal, ModalContent } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { SecretVersionDiffView } from "@app/pages/secret-manager/CommitDetailsPage/components/SecretVersionDiffView";
import { HIDDEN_SECRET_VALUE_API_MASK } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

import {
  PendingChange,
  PendingChanges,
  useBatchMode,
  useBatchModeActions
} from "../../SecretMainPage.store";

// Normalize secret value to match backend behavior:
// - Trim whitespace
// - If value ends with \n, preserve it (but trim everything else)
// This matches the backend transform: (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim())
const normalizeSecretValue = (value: string | null | undefined): string => {
  if (!value || typeof value !== "string") return "";
  // If value ends with \n, preserve it after trimming
  if (value.at(-1) === "\n") {
    return `${value.trim()}\n`;
  }
  return value.trim();
};

// Compare normalized values to determine if they're actually different
const areValuesEqual = (
  oldValue: string | null | undefined,
  newValue: string | null | undefined
): boolean => {
  const normalizedOld = normalizeSecretValue(oldValue);
  const normalizedNew = normalizeSecretValue(newValue);
  return normalizedOld === normalizedNew;
};

interface CommitFormProps {
  onCommit: (changes: PendingChanges, commitMessage: string) => Promise<void>;
  isCommitting?: boolean;
  environment: string;
  projectId: string;
  secretPath: string;
}

interface ResourceChangeProps {
  change: PendingChange;
  environment: string;
  projectId: string;
  secretPath: string;
}

type RenderResourceProps = {
  onDiscard: () => void;
  change: PendingChange;
};

const RenderSecretChanges = ({ onDiscard, change }: RenderResourceProps) => {
  if (change.resourceType !== "secret") return null;

  if (change.type === PendingAction.Create) {
    return (
      <SecretVersionDiffView
        onDiscard={onDiscard}
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
              tags: change.tags,
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
    const hasValueChange = !areValuesEqual(change.secretValue, change.originalValue);
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

    return (
      <SecretVersionDiffView
        onDiscard={onDiscard}
        item={{
          secretKey: change.secretKey,
          isUpdated: true,
          type: "secret",
          id: change.id,
          versions: [
            {
              version: 1, // placeholder, not used
              secretKey: change.newSecretName ? existingSecret.key : undefined,
              secretValue:
                // eslint-disable-next-line no-nested-ternary
                change.secretValue !== undefined
                  ? change.existingSecret.secretValueHidden
                    ? HIDDEN_SECRET_VALUE_API_MASK
                    : (change.originalValue ?? "")
                  : undefined,
              tags: change.tags ? (existingSecret.tags?.map((tag) => tag.slug) ?? []) : undefined,
              secretMetadata: change.secretMetadata ? existingSecret.secretMetadata : undefined,
              skipMultilineEncoding:
                typeof change.skipMultilineEncoding === "boolean"
                  ? existingSecret.skipMultilineEncoding
                  : undefined,
              comment: change.secretComment !== undefined ? existingSecret.comment : undefined
            },
            {
              version: 2, // placeholder, not used
              secretKey: change.newSecretName,
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

  if (change.type === PendingAction.Delete) {
    const { secretKey, secretValue, secretValueHidden } = change;
    return (
      <SecretVersionDiffView
        onDiscard={onDiscard}
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
                : undefined
            }
          ]
        }}
      />
    );
  }

  return null;
};

const RenderFolderChanges = ({ onDiscard, change }: RenderResourceProps) => {
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

const ResourceChange: React.FC<ResourceChangeProps> = ({
  change,
  environment,
  projectId,
  secretPath
}) => {
  const { removePendingChange } = useBatchModeActions();

  const handleDeletePending = useCallback(
    (changeType: string, id: string) => {
      removePendingChange(id, changeType, {
        projectId,
        environment,
        secretPath
      });
    },
    [change.resourceType, change.id]
  );

  return change.resourceType === "secret" ? (
    <RenderSecretChanges
      key={change.id}
      change={change}
      onDiscard={() => handleDeletePending(change.resourceType, change.id)}
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
                      onClick={() => setIsModalOpen(true)}
                      isDisabled={totalChangesCount === 0}
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
          className="max-h-[90vh] max-w-[95%] md:max-w-8xl"
        >
          <div className="space-y-6">
            {/* Changes List */}
            <div className="space-y-6">
              <div className="max-h-[50vh] space-y-4 overflow-y-auto">
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
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

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

            {/* Action Buttons */}
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
        </ModalContent>
      </Modal>
    </>
  );
};
