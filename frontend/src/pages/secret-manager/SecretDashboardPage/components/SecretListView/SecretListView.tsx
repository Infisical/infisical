import { useCallback, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { CreateTagModal } from "@app/components/tags/CreateTagModal";
import { DeleteActionModal } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { useCreateSecretV3, useDeleteSecretV3, useUpdateSecretV3 } from "@app/hooks/api";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";
import { UsedBySecretSyncs } from "@app/hooks/api/dashboard/types";
import { commitKeys } from "@app/hooks/api/folderCommits/queries";
import { secretApprovalRequestKeys } from "@app/hooks/api/secretApprovalRequest/queries";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { secretKeys } from "@app/hooks/api/secrets/queries";
import { SecretType, SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import { secretSnapshotKeys } from "@app/hooks/api/secretSnapshots/queries";
import { WsTag } from "@app/hooks/api/types";
import { useNavigationBlocker } from "@app/hooks/useNavigationBlocker";
import { AddShareSecretModal } from "@app/pages/organization/SecretSharingPage/components/ShareSecret/AddShareSecretModal";

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
import { HIDDEN_SECRET_VALUE, HIDDEN_SECRET_VALUE_API_MASK, SecretItem } from "./SecretItem";
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
  excludePendingCreates?: boolean;
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
  colWidth,
  excludePendingCreates = false
}: Props) => {
  const queryClient = useQueryClient();
  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "deleteSecret",
    "secretDetail",
    "createTag",
    "createSharedSecret"
  ] as const);

  // strip of side effect queries
  const { mutateAsync: createSecretV3 } = useCreateSecretV3({
    options: { onSuccess: undefined }
  });
  const { mutateAsync: updateSecretV3 } = useUpdateSecretV3({
    options: { onSuccess: undefined }
  });
  const { mutateAsync: deleteSecretV3 } = useDeleteSecretV3({
    options: { onSuccess: undefined }
  });

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

  const handleSecretOperation = async (
    operation: "create" | "update" | "delete",
    type: SecretType,
    key: string,
    {
      secretValueHidden,
      value,
      comment,
      reminderRepeatDays,
      reminderNote,
      reminderRecipients,
      tags,
      skipMultilineEncoding,
      newKey,
      secretId,
      secretMetadata,
      isRotatedSecret
    }: Partial<{
      secretValueHidden: boolean;
      value: string;
      comment: string;
      reminderRepeatDays: number | null;
      reminderNote: string | null;
      reminderRecipients?: string[] | null;
      tags: string[];
      skipMultilineEncoding: boolean | null;
      newKey: string;
      secretId: string;
      secretMetadata?: { key: string; value: string }[];
      isRotatedSecret?: boolean;
    }> = {}
  ) => {
    if (operation === "delete") {
      await deleteSecretV3({
        environment,
        projectId,
        secretPath,
        secretKey: key,
        type,
        secretId
      });
      return;
    }

    if (operation === "update") {
      let secretValue = value;

      if (
        secretValueHidden &&
        (value === HIDDEN_SECRET_VALUE_API_MASK || value === HIDDEN_SECRET_VALUE)
      ) {
        secretValue = undefined;
      }

      await updateSecretV3({
        environment,
        projectId,
        secretPath,
        secretKey: key,
        ...(!isRotatedSecret && {
          newSecretName: newKey,
          secretValue: secretValueHidden ? secretValue : secretValue || ""
        }),
        type,
        tagIds: tags,
        secretComment: comment,
        secretReminderRepeatDays: reminderRepeatDays,
        secretReminderNote: reminderNote,
        secretReminderRecipients: reminderRecipients,
        skipMultilineEncoding,
        secretMetadata
      });
      return;
    }

    await createSecretV3(
      {
        environment,
        projectId,
        secretPath,
        secretKey: key,
        secretValue: value || "",
        secretComment: "",
        skipMultilineEncoding,
        type
      },
      {}
    );
  };

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
        overrideAction,
        idOverride,
        valueOverride,
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

      // personal secret change
      let personalAction = false;
      if (overrideAction === "deleted") {
        await handleSecretOperation("delete", SecretType.Personal, oldKey, {
          secretId: orgSecret.idOverride
        });
        personalAction = true;
      } else if (overrideAction && idOverride) {
        await handleSecretOperation("update", SecretType.Personal, oldKey, {
          value: valueOverride,
          newKey: hasKeyChanged ? key : undefined,
          secretId: orgSecret.idOverride,
          skipMultilineEncoding: modSecret.skipMultilineEncoding
        });
        personalAction = true;
      } else if (overrideAction) {
        await handleSecretOperation("create", SecretType.Personal, oldKey, {
          value: valueOverride
        });
        personalAction = true;
      }

      // shared secret change
      if (!isSharedSecUnchanged && !personalAction) {
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

        await handleSecretOperation("update", SecretType.Shared, oldKey, {
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
        });
        if (cb) cb();
      }
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({
          projectId,
          secretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.list({
          projectId,
          environment,
          directory: secretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.count({
          projectId,
          environment,
          directory: secretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({
          projectId,
          environment,
          directory: secretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.count({ projectId })
      });
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
        type: isProtectedBranch && !personalAction ? "info" : "success",
        text:
          isProtectedBranch && !personalAction
            ? "Requested changes have been sent for review"
            : successMessage
      });
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
      secretValueHidden,
      tags,
      secretMetadata,
      skipMultilineEncoding,
      comment
    } = popUp.deleteSecret?.data as SecretV3RawSanitized;
    if (isBatchMode) {
      const secretValueForDelete = value !== undefined ? value : HIDDEN_SECRET_VALUE_API_MASK;

      const deleteChange: PendingSecretDelete = {
        id: `${secretId}`,
        type: PendingAction.Delete,
        secretKey: key,
        secretValue: secretValueForDelete,
        timestamp: Date.now(),
        resourceType: "secret",
        secretValueHidden,
        tags: tags || [],
        secretMetadata: secretMetadata || [],
        skipMultilineEncoding: skipMultilineEncoding || false,
        comment: comment || ""
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

    await handleSecretOperation("delete", SecretType.Shared, key, { secretId });
    // wrap this in another function and then reuse
    queryClient.invalidateQueries({
      queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
    });
    queryClient.invalidateQueries({
      queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
    });
    queryClient.invalidateQueries({
      queryKey: secretSnapshotKeys.list({
        projectId,
        environment,
        directory: secretPath
      })
    });
    queryClient.invalidateQueries({
      queryKey: secretSnapshotKeys.count({
        projectId,
        environment,
        directory: secretPath
      })
    });
    queryClient.invalidateQueries({
      queryKey: commitKeys.count({ projectId, environment, directory: secretPath })
    });
    queryClient.invalidateQueries({
      queryKey: commitKeys.history({ projectId, environment, directory: secretPath })
    });
    queryClient.invalidateQueries({
      queryKey: secretApprovalRequestKeys.count({ projectId })
    });
    handlePopUpClose("deleteSecret");
    handlePopUpClose("secretDetail");
    createNotification({
      type: isProtectedBranch ? "info" : "success",
      text: isProtectedBranch
        ? "Requested changes have been sent for review"
        : "Successfully deleted secret"
    });
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
  const onShareSecret = useCallback(
    (sec: SecretV3RawSanitized) =>
      handlePopUpOpen("createSharedSecret", {
        value: sec.valueOverride ?? sec.value
      }),
    []
  );

  return (
    <>
      {FontAwesomeSpriteSymbols.map(({ icon, symbol }) => (
        <FontAwesomeIcon icon={icon} symbol={symbol} key={`font-awesome-svg-spritie-${symbol}`} />
      ))}
      {secrets
        .filter((secret) => {
          if (!excludePendingCreates) return true;
          return !secret.isPending || secret.pendingAction !== PendingAction.Create;
        })
        .map((secret) => (
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
            onShareSecret={onShareSecret}
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
          handleSecretShare={(value: string) => handlePopUpOpen("createSharedSecret", { value })}
        />
      )}
      <CreateTagModal
        isOpen={popUp.createTag.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("createTag", isOpen)}
        append={append}
        currentSecret={popUp.createTag.data}
      />
      <AddShareSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </>
  );
};
