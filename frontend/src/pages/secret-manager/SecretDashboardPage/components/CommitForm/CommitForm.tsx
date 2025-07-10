/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useState } from "react";
import { faCodeCommit, faFolder, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Badge,
  Button,
  FontAwesomeSymbol,
  IconButton,
  Input,
  Modal,
  ModalContent
} from "@app/components/v2";

import {
  PendingChange,
  PendingChanges,
  useBatchMode,
  useBatchModeActions
} from "../../SecretMainPage.store";
import { FontAwesomeSpriteName } from "../SecretListView/SecretListView.utils";

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
        <Badge key={tag.id} variant="primary" className="text-xs">
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
      <td className="w-24 py-3 pl-4 align-top font-medium text-mineshaft-300">{label}:</td>
      <td className="w-1/2 px-3 py-3 align-top">
        <div className="text-red-400 opacity-80">{previousValue}</div>
      </td>
      <td className="w-1/2 py-3 pr-4 align-top">
        <div className="text-green-400">{newValue}</div>
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
  const getChangeBadge = (type: PendingChange["type"]) => {
    switch (type) {
      case "create":
        return <Badge variant="success">Created</Badge>;
      case "update":
        return <Badge variant="primary">Updated</Badge>;
      case "delete":
        return <Badge variant="danger">Deleted</Badge>;
      default:
        return null;
    }
  };

  const renderSecretChanges = () => {
    if (change.resourceType !== "secret") return null;

    if (change.type === "create") {
      return (
        <div className="mt-3 overflow-hidden rounded-md border border-mineshaft-700 bg-mineshaft-900">
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

    if (change.type === "update") {
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
        <div className="mt-3 overflow-hidden rounded-md border border-mineshaft-700 bg-mineshaft-900">
          <table className="w-full text-sm">
            <tbody>
              {hasKeyChange && (
                <ComparisonTableRow
                  label="Key"
                  previousValue={<span className="font-mono">{change.secretKey}</span>}
                  newValue={<span className="font-mono">{change.newSecretName}</span>}
                />
              )}
              {hasValueChange && (
                <ComparisonTableRow
                  label="Value"
                  previousValue={
                    <div className="max-w-md break-all rounded">
                      {change.originalValue || <span className="italic">(empty)</span>}
                    </div>
                  }
                  newValue={
                    <div className="max-w-md break-all rounded">
                      {change.secretValue || <span className="italic">(empty)</span>}
                    </div>
                  }
                />
              )}
              {hasCommentChange && (
                <ComparisonTableRow
                  label="Comment"
                  previousValue={change.originalComment || <span className="italic">(empty)</span>}
                  newValue={change.secretComment || <span className="italic">(empty)</span>}
                />
              )}
              {hasMultilineChange && (
                <ComparisonTableRow
                  label="Multiline"
                  previousValue={change.originalSkipMultilineEncoding ? "Enabled" : "Disabled"}
                  newValue={change.skipMultilineEncoding ? "Enabled" : "Disabled"}
                />
              )}
              {hasTagsChange && (
                <ComparisonTableRow
                  label="Tags"
                  previousValue={<TagsList tags={change.originalTags} />}
                  newValue={<TagsList tags={change.tags} />}
                />
              )}
              {hasMetadataChange && (
                <ComparisonTableRow
                  label="Metadata"
                  previousValue={<MetadataList metadata={change.originalSecretMetadata} />}
                  newValue={<MetadataList metadata={change.secretMetadata} />}
                />
              )}
            </tbody>
          </table>
        </div>
      );
    }

    if (change.type === "delete") {
      return (
        <div className="mt-3 overflow-hidden rounded-md border border-red-700 bg-red-900/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-red-600 bg-red-800/30">
                <th className="w-24 py-2 pl-4 text-left text-xs font-medium text-red-300">Field</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-red-300">
                  Deleted Value
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-red-700">
                <td className="w-24 py-3 pl-4 font-medium text-red-300">Key:</td>
                <td className="px-3 py-3 font-mono text-red-100 line-through" colSpan={2}>
                  {change.secretKey}
                </td>
              </tr>
              <tr className="border-b border-red-700 last:border-b-0">
                <td className="w-24 py-3 pl-4 font-medium text-red-300">Value:</td>
                <td className="px-3 py-3" colSpan={2}>
                  <div className="max-w-md break-all rounded bg-red-800/50 px-2 py-1 font-mono text-xs text-red-100 line-through">
                    {change.secretValue || <span className="italic">(empty)</span>}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      );
    }

    return null;
  };

  const renderFolderChanges = () => {
    if (change.resourceType !== "folder") return null;

    if (change.type === "create") {
      return (
        <div className="mt-3 overflow-hidden rounded-md border border-mineshaft-700 bg-mineshaft-900">
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
        </div>
      );
    }

    if (change.type === "update") {
      const hasNameChange = change.folderName !== change.originalFolderName;
      const hasDescriptionChange = change.description !== change.originalDescription;

      const hasChanges = [hasNameChange, hasDescriptionChange].some(Boolean);

      if (!hasChanges) return null;

      return (
        <div className="mt-3 overflow-hidden rounded-md border border-mineshaft-700 bg-mineshaft-900">
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
        </div>
      );
    }

    if (change.type === "delete") {
      return (
        <div className="mt-3 overflow-hidden rounded-md border border-red-700 bg-red-900/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-red-600 bg-red-800/30">
                <th className="w-24 py-2 pl-4 text-left text-xs font-medium text-red-300">Field</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-red-300">
                  Deleted Value
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-red-700 last:border-b-0">
                <td className="w-24 py-3 pl-4 font-medium text-red-300">Name:</td>
                <td className="px-3 py-3 font-mono text-red-100 line-through" colSpan={2}>
                  {change.folderName}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      );
    }

    return null;
  };

  const getChangeName = () => {
    if (change.resourceType === "secret") {
      return change.type === "update" ? change.newSecretName || change.secretKey : change.secretKey;
    }
    if (change.resourceType === "folder") {
      return change.type === "update" ? change.originalFolderName : change.folderName;
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

  return (
    <div className="py-2 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-medium text-mineshaft-100">{getChangeName()}</span>
          {getChangeBadge(change.type)}
        </div>
        <IconButton
          ariaLabel="delete-change"
          variant="plain"
          colorSchema="danger"
          size="sm"
          onClick={() => handleDeletePending(change.resourceType, change.id)}
        >
          <FontAwesomeSymbol symbolName={FontAwesomeSpriteName.Close} className="h-4 w-4" />
        </IconButton>
      </div>
      {change.resourceType === "secret" ? renderSecretChanges() : renderFolderChanges()}
    </div>
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

    try {
      await onCommit(pendingChanges, commitMessage);
      clearAllPendingChanges({
        workspaceId,
        environment,
        secretPath
      });
      setIsModalOpen(false);
      setCommitMessage("");
    } catch (error) {
      console.error("Failed to commit changes:", error);
    }
  };

  return (
    <>
      {/* Floating Panel */}
      {!isModalOpen && (
        <div className="fixed bottom-4 z-40 w-80 self-center rounded-lg border border-mineshaft-600 bg-mineshaft-800 shadow-2xl">
          <div className="flex w-full justify-center border-b border-mineshaft-600 px-4 py-3">
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faCodeCommit} className="text-primary" />
                <span className="font-medium text-mineshaft-100">Ready to Commit</span>
              </div>
              <Badge variant="primary" className="text-xs">
                {totalChangesCount} change{totalChangesCount !== 1 ? "s" : ""}
              </Badge>
            </div>
          </div>

          <div className="p-3">
            <Button
              onClick={() => setIsModalOpen(true)}
              className="w-full"
              isDisabled={totalChangesCount === 0}
              colorSchema="secondary"
            >
              Review & Commit
            </Button>
          </div>
        </div>
      )}

      {/* Commit Modal */}
      <Modal isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
        <ModalContent
          title={
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faCodeCommit} className="text-primary" />
              Commit Changes
              <Badge variant="primary" className="ml-2">
                {totalChangesCount} change{totalChangesCount !== 1 ? "s" : ""}
              </Badge>
            </div>
          }
          className="max-h-[90vh] max-w-5xl"
        >
          <div className="space-y-6">
            <p className="text-mineshaft-300">
              Write a commit message and review the changes you&apos;re about to commit.
            </p>

            {/* Changes List */}
            <div className="space-y-6">
              <div className="max-h-96 space-y-4 overflow-y-auto pr-2">
                {/* Folder Changes */}
                {pendingChanges.folders.length > 0 && (
                  <div>
                    <h4 className="mb-4 flex items-center gap-2 border-b border-mineshaft-700 pb-2 text-sm font-semibold text-mineshaft-200">
                      <FontAwesomeIcon icon={faFolder} className="text-mineshaft-300" />
                      Folders ({pendingChanges.folders.length})
                    </h4>
                    <div className="space-y-3">
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
                    <h4 className="mb-4 flex items-center gap-2 border-b border-mineshaft-700 pb-2 text-sm font-semibold text-mineshaft-200">
                      <FontAwesomeIcon icon={faKey} className="text-mineshaft-300" />
                      Secrets ({pendingChanges.secrets.length})
                    </h4>
                    <div className="space-y-3">
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
            <div className="flex justify-end gap-3 border-t border-mineshaft-600 pt-4">
              <Button
                variant="outline_bg"
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
