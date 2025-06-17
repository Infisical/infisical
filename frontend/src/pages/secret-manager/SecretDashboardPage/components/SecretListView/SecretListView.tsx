import { useCallback } from "react";
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
import { secretKeys } from "@app/hooks/api/secrets/queries";
import { SecretType, SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import { secretSnapshotKeys } from "@app/hooks/api/secretSnapshots/queries";
import { WsTag } from "@app/hooks/api/types";
import { AddShareSecretModal } from "@app/pages/organization/SecretSharingPage/components/ShareSecret/AddShareSecretModal";

import { useSelectedSecretActions, useSelectedSecrets } from "../../SecretMainPage.store";
import { CollapsibleSecretImports } from "./CollapsibleSecretImports";
import { SecretDetailSidebar } from "./SecretDetailSidebar";
import { HIDDEN_SECRET_VALUE, HIDDEN_SECRET_VALUE_API_MASK, SecretItem } from "./SecretItem";
import { FontAwesomeSpriteSymbols } from "./SecretListView.utils";

type Props = {
  secrets?: SecretV3RawSanitized[];
  environment: string;
  workspaceId: string;
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
};

export const SecretListView = ({
  secrets = [],
  environment,
  workspaceId,
  secretPath = "/",
  tags: wsTags = [],
  isVisible,
  isProtectedBranch = false,
  usedBySecretSyncs,
  importedBy
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
    options: {
      onSuccess: undefined
    }
  });
  const { mutateAsync: updateSecretV3 } = useUpdateSecretV3({
    options: {
      onSuccess: undefined
    }
  });
  const { mutateAsync: deleteSecretV3 } = useDeleteSecretV3({
    options: {
      onSuccess: undefined
    }
  });
  const selectedSecrets = useSelectedSecrets();
  const { toggle: toggleSelectedSecret } = useSelectedSecretActions();

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
      skipMultilineEncoding: boolean;
      newKey: string;
      secretId: string;
      secretMetadata?: { key: string; value: string }[];
      isRotatedSecret?: boolean;
    }> = {}
  ) => {
    if (operation === "delete") {
      await deleteSecretV3({
        environment,
        workspaceId,
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
        workspaceId,
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
        workspaceId,
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

  const handleSaveSecret = useCallback(
    async (
      orgSecret: SecretV3RawSanitized,
      modSecret: Omit<SecretV3RawSanitized, "tags"> & {
        tags?: { id: string }[];
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
        isReminderEvent
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
            projectId: workspaceId,
            secretPath
          })
        });
        queryClient.invalidateQueries({
          queryKey: secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
        });
        queryClient.invalidateQueries({
          queryKey: secretSnapshotKeys.list({ workspaceId, environment, directory: secretPath })
        });
        queryClient.invalidateQueries({
          queryKey: secretSnapshotKeys.count({ workspaceId, environment, directory: secretPath })
        });
        queryClient.invalidateQueries({
          queryKey: commitKeys.count({ workspaceId, environment, directory: secretPath })
        });
        queryClient.invalidateQueries({
          queryKey: commitKeys.history({ workspaceId, environment, directory: secretPath })
        });
        queryClient.invalidateQueries({
          queryKey: secretApprovalRequestKeys.count({ workspaceId })
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
      } catch (error) {
        console.log(error);
        createNotification({
          type: "error",
          text: "Failed to save secret"
        });
      }
    },
    [environment, secretPath, isProtectedBranch]
  );

  const handleSecretDelete = useCallback(async () => {
    const { key, id: secretId } = popUp.deleteSecret?.data as SecretV3RawSanitized;
    try {
      await handleSecretOperation("delete", SecretType.Shared, key, { secretId });
      // wrap this in another function and then reuse
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.list({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.count({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.count({ workspaceId })
      });
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
    isProtectedBranch
  ]);

  // for optimization on minimise re-rendering of secret items
  const onCreateTag = useCallback(() => handlePopUpOpen("createTag"), []);
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
          handleSecretShare={() =>
            handlePopUpOpen("createSharedSecret", {
              value: secret.valueOverride ?? secret.value
            })
          }
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
      <CreateTagModal
        isOpen={popUp.createTag.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("createTag", isOpen)}
      />
      <AddShareSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </>
  );
};
