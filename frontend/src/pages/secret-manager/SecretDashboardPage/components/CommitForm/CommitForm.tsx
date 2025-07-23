/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useCallback, useState } from "react";
import { faCodeCommit, faEye, faFolder, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge, Button, Input, Modal, ModalContent } from "@app/components/v2";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { SecretVersionDiffView } from "@app/pages/secret-manager/CommitDetailsPage/components/SecretVersionDiffView";

import {
  PendingChange,
  PendingChanges,
  useBatchMode,
  useBatchModeActions
} from "../../SecretMainPage.store";

interface CommitFormProps {
  onCommit: (changes: PendingChanges, commitMessage: string) => Promise<void>;
  isCommitting?: boolean;
  environment: string;
  workspaceId: string;
  secretPath: string;
}

interface ResourceChangeProps {
  change: PendingChange;
  environment: string;
  workspaceId: string;
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
                change.secretValue !== undefined ? (existingSecret.value ?? "") : undefined,
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
    const { secretKey, secretValue } = change;
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
              secretValue
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
  workspaceId,
  secretPath
}) => {
  const { removePendingChange } = useBatchModeActions();

  const handleDeletePending = useCallback(
    (changeType: string, id: string) => {
      removePendingChange(id, changeType, {
        workspaceId,
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
  workspaceId,
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
    if (!commitMessage.trim()) {
      return;
    }
    await onCommit(pendingChanges, commitMessage);
    clearAllPendingChanges({
      workspaceId,
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
        <div className="fixed bottom-4 left-1/2 z-40 w-full max-w-3xl -translate-x-1/2 self-center rounded-lg border border-yellow/30 bg-mineshaft-800 shadow-2xl lg:left-auto lg:translate-x-0">
          <div className="flex items-center justify-between p-4">
            {/* Left Content */}
            <div className="flex-1">
              {/* Header */}
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-yellow-500" />
                <span className="font-medium text-mineshaft-100">Pending Changes</span>
                <Badge variant="primary" className="text-xs">
                  {totalChangesCount} Change{totalChangesCount !== 1 ? "s" : ""}
                </Badge>
              </div>

              {/* Description */}
              <p className="text-sm leading-5 text-mineshaft-400">
                Review pending changes and commit them to apply the updates.
              </p>
            </div>

            {/* Right Buttons */}
            <div className="ml-6 mt-0.5 flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => clearAllPendingChanges({ workspaceId, environment, secretPath })}
                isDisabled={totalChangesCount === 0}
                variant="outline_bg"
                className="px-4 hover:border-red/40 hover:bg-red/[0.1]"
              >
                Discard
              </Button>
              <Button
                variant="solid"
                leftIcon={<FontAwesomeIcon icon={faEye} />}
                onClick={() => setIsModalOpen(true)}
                isDisabled={totalChangesCount === 0}
                className="px-6"
              >
                Review Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Commit Modal */}
      <Modal isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
        <ModalContent
          title={
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faCodeCommit} className="text-mineshaft-400" />
              Commit Changes
              <Badge variant="primary" className="mt-[0.05rem]">
                {totalChangesCount} Change{totalChangesCount !== 1 ? "s" : ""}
              </Badge>
            </div>
          }
          subTitle={"Write a commit message and review the changes you&apos;re about to commit."}
          className="max-h-[90vh] max-w-[95%] md:max-w-7xl"
        >
          <div className="space-y-6">
            {/* Changes List */}
            <div className="space-y-6">
              <div className="max-h-[50vh] space-y-4 overflow-y-auto">
                {/* Folder Changes */}
                {pendingChanges.folders.length > 0 && (
                  <div>
                    <h4 className="mb-4 flex items-center gap-2 border-b border-mineshaft-700 pb-2 text-sm font-semibold text-mineshaft-200">
                      <FontAwesomeIcon icon={faFolder} className="text-mineshaft-300" />
                      Folders ({pendingChanges.folders.length})
                    </h4>
                    <div>
                      {pendingChanges.folders.map((change) => (
                        <ResourceChange
                          key={change.id}
                          change={change}
                          environment={environment}
                          workspaceId={workspaceId}
                          secretPath={secretPath}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Secret Changes */}
                {pendingChanges.secrets.length > 0 && (
                  <div>
                    <h4 className="mb-4 flex items-center gap-2 border-b border-mineshaft-700 pb-2 text-sm font-semibold text-mineshaft-200">
                      <FontAwesomeIcon icon={faKey} className="mr-1 text-mineshaft-300" />
                      Secrets ({pendingChanges.secrets.length})
                    </h4>
                    <div>
                      {pendingChanges.secrets.map((change) => (
                        <ResourceChange
                          key={change.id}
                          change={change}
                          environment={environment}
                          workspaceId={workspaceId}
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
                Commit Message <span className="text-red-400">*</span>
              </label>
              <Input
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Describe your changes..."
                className="w-full"
                required
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
                isDisabled={isCommitting || !commitMessage.trim()}
                leftIcon={<FontAwesomeIcon icon={faCodeCommit} />}
                colorSchema="primary"
                variant="outline_bg"
              >
                {isCommitting ? "Committing..." : "Commit Changes"}
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
};
