/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useState } from "react";
import { faCodeCommit, faEye, faFolder, faKey, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge, Button, Input, Modal, ModalContent } from "@app/components/v2";
import { useToggle } from "@app/hooks";
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

interface ChangeTableProps {
  change: PendingChange;
  environment: string;
  workspaceId: string;
  secretPath: string;
}

const TagsList: React.FC<{ tags?: { id: string; slug: string }[]; className?: string }> = ({
  tags,
  className = ""
}) => {
  if (!tags || tags.length === 0) {
    return <span className={`italic text-mineshaft-400 ${className}`}>(no tags)</span>;
  }

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {tags.map((tag) => (
        <Badge key={tag.id} variant="success" className="text-xs">
          {tag.slug}
        </Badge>
      ))}
    </div>
  );
};

const MetadataList: React.FC<{
  metadata?: { key: string; value: string }[];
  className?: string;
}> = ({ metadata, className = "" }) => {
  if (!metadata || metadata.length === 0) {
    return <span className={`italic text-mineshaft-400 ${className}`}>(no metadata)</span>;
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {metadata.map((item) => (
        <div key={item.key} className="flex items-center gap-2 text-xs">
          <span className="font-medium text-mineshaft-300">{item.key}:</span>
          <span className="font-mono text-mineshaft-100">{item.value}</span>
        </div>
      ))}
    </div>
  );
};

const ComparisonTableRow: React.FC<{
  label: string;
  previousValue: React.ReactNode;
  newValue: React.ReactNode;
  hideIfSame?: boolean;
}> = ({ label, previousValue, newValue, hideIfSame = false }) => {
  const isSame = hideIfSame && String(previousValue) === String(newValue);

  if (isSame) return null;

  return (
    <tr className="border-b border-mineshaft-700 last:border-b-0">
      <td className="w-[12%] border-r border-mineshaft-600 px-4 py-3 align-top font-medium text-mineshaft-300">
        {label}
      </td>
      <td className="w-1/2 border-r border-mineshaft-600 px-4 py-3 align-top">
        <div className="text-red-400 opacity-80">{previousValue}</div>
      </td>
      <td className="w-1/2 py-3 pr-4 align-top">
        <div className="px-4 text-green-400">{newValue}</div>
      </td>
    </tr>
  );
};

const ChangeTable: React.FC<ChangeTableProps> = ({
  change,
  environment,
  workspaceId,
  secretPath
}) => {
  const [isOpen, setIsOpen] = useToggle(true);

  const getChangeBadge = (type: PendingChange["type"]) => {
    switch (type) {
      case PendingAction.Create:
        return <Badge variant="success">Created</Badge>;
      case PendingAction.Update:
        return <Badge variant="primary">Updated</Badge>;
      case PendingAction.Delete:
        return <Badge variant="danger">Deleted</Badge>;
      default:
        return null;
    }
  };

  const renderSecretChanges = () => {
    if (change.resourceType !== "secret") return null;

    if (change.type === PendingAction.Create) {
      return (
        <div className="overflow-hidden rounded-md bg-mineshaft-900/80">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-mineshaft-700">
                <td className="w-24 py-3 pl-4 font-medium text-mineshaft-300">Key:</td>
                <td className="px-3 py-3 font-mono text-mineshaft-100" colSpan={2}>
                  {change.secretKey}
                </td>
              </tr>
              <tr className="border-b border-mineshaft-700">
                <td className="w-24 py-3 pl-4 font-medium text-mineshaft-300">Value:</td>
                <td className="px-3 py-3" colSpan={2}>
                  <div className="max-w-md break-all px-2 py-1 font-mono text-xs text-mineshaft-100">
                    {change.secretValue || (
                      <span className="italic text-mineshaft-400">(empty)</span>
                    )}
                  </div>
                </td>
              </tr>
              {change.secretComment !== undefined && change.secretComment !== "" && (
                <tr className="border-b border-mineshaft-700">
                  <td className="w-24 py-3 pl-4 font-medium text-mineshaft-300">Comment:</td>
                  <td className="px-3 py-3 text-mineshaft-100" colSpan={2}>
                    {change.secretComment}
                  </td>
                </tr>
              )}
              {change.tags && change.tags.length > 0 && (
                <tr className="border-b border-mineshaft-700">
                  <td className="w-24 py-3 pl-4 font-medium text-mineshaft-300">Tags:</td>
                  <td className="px-3 py-3" colSpan={2}>
                    <TagsList tags={change.tags} />
                  </td>
                </tr>
              )}
              {change.secretMetadata && change.secretMetadata.length > 0 && (
                <tr className="border-b border-mineshaft-700 last:border-b-0">
                  <td className="w-24 py-3 pl-4 font-medium text-mineshaft-300">Metadata:</td>
                  <td className="px-3 py-3" colSpan={2}>
                    <MetadataList metadata={change.secretMetadata} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
          item={{
            secretKey: change.secretKey,
            isUpdated: true,
            type: "secret",
            id: change.id,
            versions: [
              {
                version: 1,
                secretKey: change.newSecretName ? existingSecret.key : undefined,
                secretValue: change.secretValue ? existingSecret.value : undefined,
                tags: change.tags ? existingSecret.tags : undefined,
                secretMetadata: change.secretMetadata ? existingSecret.secretMetadata : undefined,
                skipMultilineEncoding:
                  typeof change.skipMultilineEncoding === "boolean"
                    ? existingSecret.skipMultilineEncoding
                    : undefined,
                comment: change.secretComment !== undefined ? existingSecret.comment : undefined
              },
              {
                version: 2,
                secretKey: change.newSecretName,
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

    if (change.type === PendingAction.Delete) {
      const { secretKey, secretValue } = change;
      return (
        <SecretVersionDiffView
          item={{
            secretKey: change.secretKey,
            isDeleted: true,
            type: "secret",
            id: change.id,
            versions: [
              {
                version: 1,
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

  const renderFolderChanges = () => {
    if (change.resourceType !== "folder") return null;

    if (change.type === PendingAction.Create) {
      return (
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-mineshaft-700">
              <td className="w-24 py-3 pl-4 font-medium text-mineshaft-300">Name:</td>
              <td className="px-3 py-3 font-mono text-mineshaft-100" colSpan={2}>
                {change.folderName}
              </td>
            </tr>
            {change.description !== undefined && change.description !== "" && (
              <tr className="border-b border-mineshaft-700 last:border-b-0">
                <td className="w-24 py-3 pl-4 font-medium text-mineshaft-300">Description:</td>
                <td className="px-3 py-3 text-mineshaft-100" colSpan={2}>
                  {change.description}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      );
    }

    if (change.type === PendingAction.Update) {
      const hasNameChange = change.folderName !== change.originalFolderName;
      const hasDescriptionChange = change.description !== change.originalDescription;

      const hasChanges = [hasNameChange, hasDescriptionChange].some(Boolean);

      if (!hasChanges) return null;

      return (
        <table className="w-full text-sm">
          <tbody>
            {hasNameChange && (
              <ComparisonTableRow
                label="Name"
                previousValue={<span className="font-mono">{change.originalFolderName}</span>}
                newValue={<span className="font-mono">{change.folderName}</span>}
              />
            )}
            {hasDescriptionChange && (
              <ComparisonTableRow
                label="Description"
                previousValue={
                  change.originalDescription || <span className="italic">(empty)</span>
                }
                newValue={change.description || <span className="italic">(empty)</span>}
              />
            )}
          </tbody>
        </table>
      );
    }

    if (change.type === PendingAction.Delete) {
      return (
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-mineshaft-700">
              <td className="w-24 py-3 pl-4 font-medium text-red-400">Name:</td>
              <td className="px-3 py-3 font-mono text-red-400 line-through" colSpan={2}>
                {change.folderName}
              </td>
            </tr>
          </tbody>
        </table>
      );
    }

    return null;
  };

  const getChangeName = () => {
    if (change.resourceType === "secret") {
      return change.type === PendingAction.Update
        ? change.newSecretName || change.secretKey
        : change.secretKey;
    }
    if (change.resourceType === "folder") {
      return change.type === PendingAction.Update ? change.originalFolderName : change.folderName;
    }
    return "Unknown";
  };

  const { removePendingChange } = useBatchModeActions();

  const handleDeletePending = (changeType: string, id: string) => {
    removePendingChange(id, changeType, {
      workspaceId,
      environment,
      secretPath
    });
  };

  return change.resourceType === "secret" ? renderSecretChanges() : renderFolderChanges();

  // return (
  //   <div className="py-2 shadow-sm">
  //     <div className="flex items-center justify-between">
  //       <div className="flex items-center gap-3">
  //         <span className="font-medium text-mineshaft-100">{getChangeName()}</span>
  //         {getChangeBadge(change.type)}
  //       </div>
  //       <Tooltip content="Discard change">
  //         <IconButton
  //           ariaLabel="delete-change"
  //           variant="plain"
  //           colorSchema="danger"
  //           size="sm"
  //           onClick={() => handleDeletePending(change.resourceType, change.id)}
  //         >
  //           <FontAwesomeIcon icon={faTrash} />
  //         </IconButton>
  //       </Tooltip>
  //     </div>
  //     {change.resourceType === "secret" ? renderSecretChanges() : renderFolderChanges()}
  //   </div>
  // );
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
        <div className="fixed bottom-4 z-40 w-64 self-center rounded-lg border border-mineshaft-600 bg-mineshaft-800 shadow-2xl">
          <div className="flex w-full justify-center border-b border-mineshaft-600 p-2">
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faCodeCommit} className="text-mineshaft-400" />
                <span className="font-medium text-mineshaft-100">Pending Changes</span>
              </div>
              <Badge variant="primary" className="text-xs">
                {totalChangesCount} Change{totalChangesCount !== 1 ? "s" : ""}
              </Badge>
            </div>
          </div>

          <div className="flex justify-center gap-2 p-2">
            <Button
              size="sm"
              leftIcon={<FontAwesomeIcon icon={faTrash} />}
              onClick={() => clearAllPendingChanges({ workspaceId, environment, secretPath })}
              isDisabled={totalChangesCount === 0}
              variant="outline_bg"
              className="h-8 flex-1 hover:border-red/40 hover:bg-red/[0.1]"
            >
              Discard
            </Button>
            <Button
              variant="outline_bg"
              leftIcon={<FontAwesomeIcon icon={faEye} />}
              onClick={() => setIsModalOpen(true)}
              isDisabled={totalChangesCount === 0}
              className="h-8 flex-1"
            >
              Review
            </Button>
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
          className="max-h-[90vh] max-w-5xl"
        >
          <div className="space-y-6">
            {/* Changes List */}
            <div className="space-y-6">
              <div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-md border border-mineshaft-600 bg-bunker-800 p-4 shadow-inner">
                {/* Folder Changes */}
                {pendingChanges.folders.length > 0 && (
                  <div>
                    <h4 className="mb-4 flex items-center gap-2 border-b border-mineshaft-700 pb-2 text-sm font-semibold text-mineshaft-200">
                      <FontAwesomeIcon icon={faFolder} className="text-mineshaft-300" />
                      Folders ({pendingChanges.folders.length})
                    </h4>
                    <div>
                      {pendingChanges.folders.map((change) => (
                        <ChangeTable
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
                    <h4 className="mb-2 flex items-center gap-2 px-2 text-sm text-mineshaft-300">
                      <FontAwesomeIcon icon={faKey} className="mr-1 text-mineshaft-300" />
                      Secrets ({pendingChanges.secrets.length})
                    </h4>
                    <div>
                      {pendingChanges.secrets.map((change) => (
                        <ChangeTable
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
