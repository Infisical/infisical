import { useCreateSecretV3, useDeleteSecretV3, useUpdateSecretV3 } from "@app/hooks/api";
import { SecretType } from "@app/hooks/api/types";
import { useCallback } from "react";
import {
  HIDDEN_SECRET_VALUE,
  HIDDEN_SECRET_VALUE_API_MASK
} from "../../pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";
import { useInvalidateSecretQueries } from "../useInvalidateSecretQueries";

interface HandleSecretParams {
  operation: "create" | "update" | "delete";
  type: SecretType;
  key: string;
  environment: string;
  secretPath: string;
}

export function useHandleSecretOperation(projectId: string) {
  const { mutateAsync: createSecretV3 } = useCreateSecretV3({
    options: { onSuccess: undefined }
  });
  const { mutateAsync: updateSecretV3 } = useUpdateSecretV3({
    options: { onSuccess: undefined }
  });
  const { mutateAsync: deleteSecretV3 } = useDeleteSecretV3({
    options: { onSuccess: undefined }
  });

  const invalidateSecretQueries = useInvalidateSecretQueries(projectId);

  const handleSecretOperation = useCallback(
    async (
      { operation, type, key, secretPath, environment }: HandleSecretParams,
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
        return deleteSecretV3({
          environment,
          projectId,
          secretPath,
          secretKey: key,
          type,
          secretId
        }).then((result) => invalidateSecretQueries({ environment, secretPath, key }, result));
      }

      if (operation === "update") {
        let secretValue = value;

        if (
          secretValueHidden &&
          (value === HIDDEN_SECRET_VALUE_API_MASK || value === HIDDEN_SECRET_VALUE)
        ) {
          secretValue = undefined;
        }

        return updateSecretV3({
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
        }).then((result) => invalidateSecretQueries({ environment, secretPath, key }, result));
      }

      return createSecretV3(
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
      ).then((result) => invalidateSecretQueries({ environment, secretPath, key }, result));
    },
    [projectId, deleteSecretV3, createSecretV3, updateSecretV3]
  );

  return handleSecretOperation;
}
