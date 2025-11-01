import { useCallback, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { CreateTagModal } from "@app/components/tags/CreateTagModal";
import { DeleteActionModal } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { UsedBySecretSyncs } from "@app/hooks/api/dashboard/types";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { SecretType, SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import { WsTag } from "@app/hooks/api/types";
import { useHandleSecretOperation } from "@app/hooks/secret-operations/useHandleSecretOperation";
import { useNavigationBlocker } from "@app/hooks/useNavigationBlocker";

import {
  PendingSecretChange,
  PendingSecretCreate,
  PendingSecretDelete,
  PendingSecretUpdate,
  useBatchMode,
  useBatchModeActions,
  useSelectedSecretActions,
  useSelectedSecrets
} from "../../SecretMainPage.store";
import { CollapsibleSecretImports } from "./CollapsibleSecretImports";
import { SecretDetailSidebar } from "./SecretDetailSidebar";
import { SecretItem } from "./SecretItem";
import { FontAwesomeSpriteSymbols } from "./SecretListView.utils";

type Props = {
  secrets?: SecretV3RawSanitized[];
  environment: string;
  projectId: string;
  secretPath?: string;
  tags?: WsTag[];
  isVisible?: boolean;
  isProtectedBranch?: boolean;
  usedBySecretSyncs?: UsedBySecretSyncs[];
  importedBy?: {
    environment: { name: string; slug: string };
    folders: {
      name: string;
      secrets?: { secretId: string; referencedSecretKey: string; referencedSecretEnv: string }[];
      isImported: boolean;
    }[];
  }[];
  colWidth: number;
};

export const SecretListView = ({
  secrets = [],
  environment,
  projectId,
  secretPath = "/",
  tags: wsTags = [],
  isVisible,
  isProtectedBranch = false,
  usedBySecretSyncs,
  importedBy,
  colWidth
}: Props) => {
  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "deleteSecret",
    "secretDetail",
    "createTag"
  ] as const);

  const selectedSecrets = useSelectedSecrets();
  const { toggle: toggleSelectedSecret } = useSelectedSecretActions();
  const { isBatchMode, pendingChanges } = useBatchMode();
  useNavigationBlocker({
    shouldBlock: pendingChanges.secrets.length > 0 || pendingChanges.folders.length > 0,
    message:
      "You have unsaved changes. If you leave now, your work will be lost. Do you want to continue?",
    context: {
      projectId,
      environment,
      secretPath
    }
  });
  const { addPendingChange } = useBatchModeActions();

  const pendingChangesRef = useRef(pendingChanges);
  useEffect(() => {
    pendingChangesRef.current = pendingChanges;
  }, [pendingChanges]);

  const handleSecretOperation = useHandleSecretOperation(projectId);

  function getTrueOriginalSecret(
    currentSecret: SecretV3RawSanitized,
    pendingSecrets: PendingSecretChange[]
  ): Omit<SecretV3RawSanitized, "tags"> & {
    tags?: { id: string; slug: string }[];
  } {
    // Find if there's already a pending change for this secret
    const existingChange = pendingSecrets.find((change) => change.id === currentSecret.id);

    if (!existingChange || existingChange.type === "create") {
      // If no existing change or it's a creation, current secret is the original
      return {
        ...currentSecret,
        tags: currentSecret.tags?.map((tag) => ({
          id: tag.id,
          slug: tag.slug
        }))
      };
    }

    if (existingChange.type === "update") {
      // If there's an existing update, reconstruct the original from the stored original values
      return {
        ...currentSecret,
        key: existingChange.secretKey, // Original key
        value: existingChange.originalValue || currentSecret.value,
        comment: existingChange.originalComment || currentSecret.comment,
        skipMultilineEncoding:
          existingChange.originalSkipMultilineEncoding ?? currentSecret.skipMultilineEncoding,
        tags:
          existingChange.originalTags?.map((tag) => ({
            id: tag.id,
            slug: tag.slug
          })) || currentSecret.tags,
        secretMetadata: existingChange.originalSecretMetadata || currentSecret.secretMetadata
      };
    }

    return {
      ...currentSecret,
      tags: currentSecret.tags?.map((tag) => ({ id: tag.id, slug: tag.slug }))
    };
  }

  // Improved handleSaveSecret function
  const handleSaveSecret = useCallback(
    async (
      orgSecret: SecretV3RawSanitized,
      modSecret: Omit<SecretV3RawSanitized, "tags"> & {
        tags?: { id: string; name?: string; slug?: string }[];
        secretMetadata?: { key: string; value: string }[];
      },
      cb?: () => void
    ) => {
      const { key: oldKey, secretValueHidden } = orgSecret;
      const {
        key,
        value,
        tags,
        comment,
        reminderRepeatDays,
        reminderNote,
        reminderRecipients,
        secretMetadata,
        isReminderEvent,
        isPending,
        pendingAction
      } = modSecret;
      const hasKeyChanged = oldKey !== key && key;

      const tagIds = tags?.map(({ id }) => id);
      const oldTagIds = (orgSecret?.tags || []).map(({ id }) => id);
      const isSameTags = JSON.stringify(tagIds) === JSON.stringify(oldTagIds);

      const isSameRecipients =
        !reminderRecipients?.some(
          (newId) => !orgSecret.secretReminderRecipients?.find((oldId) => newId === oldId.user.id)
        ) && reminderRecipients?.length === orgSecret.secretReminderRecipients?.length;

      const isSharedSecUnchanged =
        (
          [
            "key",
            "value",
            "comment",
            "skipMultilineEncoding",
            "reminderRepeatDays",
            "reminderNote",
            "reminderRecipients",
            "secretMetadata"
          ] as const
        ).every((el) => orgSecret[el] === modSecret[el]) &&
        isSameTags &&
        isSameRecipients;

      try {
        // shared secret change
        if (!isSharedSecUnchanged) {
          if (isBatchMode) {
            const isEditingPendingCreation = isPending && pendingAction === PendingAction.Create;

            if (isEditingPendingCreation) {
              const updatedCreate: PendingSecretCreate = {
                id: orgSecret.id,
                type: PendingAction.Create,
                secretKey: key,
                secretValue: value || "",
                secretComment: comment || "",
                skipMultilineEncoding: modSecret.skipMultilineEncoding || false,
                tags: tags?.map((tag) => ({ id: tag.id, slug: tag.name || tag.slug || "" })) || [],
                secretMetadata: secretMetadata || [],
                timestamp: Date.now(),
                resourceType: "secret",
                originalKey: oldKey
              };

              addPendingChange(updatedCreate, {
                projectId,
                environment,
                secretPath
              });
            } else {
              const trueOriginalSecret = getTrueOriginalSecret(
                orgSecret,
                pendingChangesRef.current.secrets
              );

              const updateChange: PendingSecretUpdate = {
                id: orgSecret.id,
                type: PendingAction.Update,
                secretKey: trueOriginalSecret.key,
                newSecretName: key,
                originalValue: trueOriginalSecret.value,
                secretValue: value,
                originalComment: trueOriginalSecret.comment,
                secretComment: comment,
                originalSkipMultilineEncoding: trueOriginalSecret.skipMultilineEncoding,
                skipMultilineEncoding: modSecret.skipMultilineEncoding,
                originalTags:
                  trueOriginalSecret.tags?.map((tag) => ({ id: tag.id, slug: tag.slug })) || [],
                tags: tags?.map((tag) => ({ id: tag.id, slug: tag.name || tag.slug || "" })) || [],
                originalSecretMetadata: trueOriginalSecret.secretMetadata || [],
                secretMetadata: secretMetadata || [],
                timestamp: Date.now(),
                resourceType: "secret",
                existingSecret: orgSecret
              };

              addPendingChange(updateChange, {
                projectId,
                environment,
                secretPath
              });
            }

            if (!isReminderEvent) {
              handlePopUpClose("secretDetail");
            }
            if (cb) cb();
            return;
          }

          await handleSecretOperation(
            { operation: "update", type: SecretType.Shared, key: oldKey, secretPath, environment },
            {
              value,
              tags: tagIds,
              comment,
              reminderRepeatDays,
              reminderNote,
              reminderRecipients,
              secretId: orgSecret.id,
              newKey: hasKeyChanged ? key : undefined,
              skipMultilineEncoding: modSecret.skipMultilineEncoding,
              secretMetadata,
              isRotatedSecret: orgSecret.isRotatedSecret,
              secretValueHidden
            }
          );
          if (cb) cb();
        }

        if (!isReminderEvent) {
          handlePopUpClose("secretDetail");
        }

        let successMessage;
        if (isReminderEvent) {
          successMessage = reminderRepeatDays
            ? "Successfully saved secret reminder"
            : "Successfully deleted secret reminder";
        } else {
          successMessage = "Successfully saved secrets";
        }

        createNotification({
          type: isProtectedBranch ? "info" : "success",
          text: isProtectedBranch ? "Requested changes have been sent for review" : successMessage
        });
      } catch (error) {
        console.log(error);
        createNotification({
          type: "error",
          text: "Failed to save secret"
        });
      }
    },
    [environment, secretPath, isProtectedBranch, isBatchMode, projectId, addPendingChange]
  );

  // Function to append newly created tag to the current secret
  const append = useCallback(
    (newTag: WsTag) => {
      const currentSecret = popUp.createTag.data as SecretV3RawSanitized;
      if (!currentSecret) return;

      const updatedTags = [...(currentSecret.tags || []), { id: newTag.id, slug: newTag.slug }];

      handleSaveSecret(currentSecret, {
        ...currentSecret,
        tags: updatedTags
      });
    },
    [popUp.createTag.data, handleSaveSecret]
  );

  const handleSecretDelete = useCallback(async () => {
    const {
      key,
      id: secretId,
      value,
      secretValueHidden
    } = popUp.deleteSecret?.data as SecretV3RawSanitized;
    try {
      if (isBatchMode) {
        const deleteChange: PendingSecretDelete = {
          id: `${secretId}`,
          type: PendingAction.Delete,
          secretKey: key,
          secretValue: value || "",
          timestamp: Date.now(),
          resourceType: "secret",
          secretValueHidden
        };

        addPendingChange(deleteChange, {
          projectId,
          environment,
          secretPath
        });

        handlePopUpClose("deleteSecret");
        handlePopUpClose("secretDetail");
        return;
      }

      await handleSecretOperation(
        { operation: "delete", type: SecretType.Shared, key, secretPath, environment },
        { secretId }
      );

      handlePopUpClose("deleteSecret");
      handlePopUpClose("secretDetail");
      createNotification({
        type: isProtectedBranch ? "info" : "success",
        text: isProtectedBranch
          ? "Requested changes have been sent for review"
          : "Successfully deleted secret"
      });
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to delete secret"
      });
    }
  }, [
    (popUp.deleteSecret?.data as SecretV3RawSanitized)?.key,
    environment,
    secretPath,
    isProtectedBranch,
    isBatchMode,
    projectId,
    addPendingChange
  ]);

  // for optimization on minimise re-rendering of secret items
  const onCreateTag = useCallback((secret?: SecretV3RawSanitized) => {
    if (secret) {
      handlePopUpOpen("createTag", secret);
    } else {
      handlePopUpOpen("createTag");
    }
  }, []);
  const onDeleteSecret = useCallback(
    (sec: SecretV3RawSanitized) => handlePopUpOpen("deleteSecret", sec),
    []
  );
  const onDetailViewSecret = useCallback(
    (sec: SecretV3RawSanitized) => handlePopUpOpen("secretDetail", sec),
    []
  );

  return (
    <>
      {FontAwesomeSpriteSymbols.map(({ icon, symbol }) => (
        <FontAwesomeIcon icon={icon} symbol={symbol} key={`font-awesome-svg-spritie-${symbol}`} />
      ))}
      {secrets.map((secret) => (
        <SecretItem
          colWidth={colWidth}
          environment={environment}
          secretPath={secretPath}
          tags={wsTags}
          isSelected={Boolean(selectedSecrets?.[secret.id])}
          onToggleSecretSelect={toggleSelectedSecret}
          isVisible={isVisible}
          secret={secret}
          key={secret.id}
          onSaveSecret={handleSaveSecret}
          onDeleteSecret={onDeleteSecret}
          onDetailViewSecret={onDetailViewSecret}
          importedBy={importedBy}
          onCreateTag={onCreateTag}
          isPending={secret.isPending}
          pendingAction={secret.pendingAction}
        />
      ))}
      <DeleteActionModal
        isOpen={popUp.deleteSecret.isOpen}
        deleteKey={(popUp.deleteSecret?.data as SecretV3RawSanitized)?.key}
        title="Do you want to delete this secret?"
        onChange={(isOpen) => handlePopUpToggle("deleteSecret", isOpen)}
        onDeleteApproved={handleSecretDelete}
        buttonText="Delete Secret"
        formContent={
          ((importedBy && importedBy.length > 0) ||
            (usedBySecretSyncs && usedBySecretSyncs?.length > 0)) && (
            <CollapsibleSecretImports
              importedBy={importedBy}
              usedBySecretSyncs={usedBySecretSyncs}
              secretsToDelete={[(popUp.deleteSecret?.data as SecretV3RawSanitized)?.key || ""]}
            />
          )
        }
        deletionMessage={
          <>
            Type the secret key{" "}
            <span className="font-bold">
              &quot;{(popUp.deleteSecret?.data as SecretV3RawSanitized)?.key}&quot;
            </span>{" "}
            to perform this action
          </>
        }
      />
      {popUp.secretDetail.data && (
        <SecretDetailSidebar
          environment={environment}
          secretPath={secretPath}
          isOpen={popUp.secretDetail.isOpen}
          onToggle={(isOpen) => handlePopUpToggle("secretDetail", isOpen)}
          secret={popUp.secretDetail.data as SecretV3RawSanitized}
          onDeleteSecret={() => handlePopUpOpen("deleteSecret", popUp.secretDetail.data)}
          onClose={() => handlePopUpClose("secretDetail")}
          onSaveSecret={handleSaveSecret}
          tags={wsTags}
          onCreateTag={() => handlePopUpOpen("createTag")}
        />
      )}
      <CreateTagModal
        isOpen={popUp.createTag.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("createTag", isOpen)}
        append={append}
        currentSecret={popUp.createTag.data}
      />
    </>
  );
};
