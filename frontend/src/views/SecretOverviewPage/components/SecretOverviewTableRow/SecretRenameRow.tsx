import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faCheck, faClose } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { IconButton, Input, Spinner, Tooltip } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { useGetUserWsKey, useUpdateSecretV3 } from "@app/hooks/api";
import { DecryptedSecret } from "@app/hooks/api/types";
import { SecretActionType } from "@app/views/SecretMainPage/components/SecretListView/SecretListView.utils";

type Props = {
  secretKey: string;
  secretPath: string;
  environments: { name: string; slug: string }[];
  getSecretByKey: (slug: string, key: string) => DecryptedSecret | undefined;
};

type Form = { key: string };

function SecretRenameRow({ environments, getSecretByKey, secretKey, secretPath }: Props) {
  const { currentWorkspace } = useWorkspace();
  const { permission } = useProjectPermission();
  const { createNotification } = useNotificationContext();

  const secrets = environments.map((env) => getSecretByKey(env.slug, secretKey));

  const isReadOnly = environments.some((env) => {
    const environment = env.slug;
    const isSecretInEnvReadOnly =
      permission.can(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      ) &&
      permission.cannot(
        ProjectPermissionActions.Edit,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      );
    if (isSecretInEnvReadOnly) {
      return true;
    }
    return false;
  });

  const isOverriden = secrets.some(
    (secret) =>
      secret?.overrideAction === SecretActionType.Created ||
      secret?.overrideAction === SecretActionType.Modified
  );
  const workspaceId = currentWorkspace?.id || "";

  const { data: decryptFileKey } = useGetUserWsKey(workspaceId);

  const { mutateAsync: updateSecretV3 } = useUpdateSecretV3();

  const {
    handleSubmit,
    control,
    reset,
    formState: { isDirty, isSubmitting }
  } = useForm<Form>({
    defaultValues: { key: secretKey },
    values: { key: secretKey }
  });

  const handleFormSubmit = async (data: Form) => {
    if (!data.key) {
      createNotification({
        type: "error",
        text: "Secret name cannot be empty"
      });
      return;
    }

    const promises = secrets
      .filter((secret) => !!secret)
      .map((secret) => {
        if (!secret) return null;

        return updateSecretV3({
          environment: secret?.env,
          workspaceId,
          secretPath,
          secretName: secret.key,
          secretId: secret.id,
          secretValue: secret.value || "",
          type: "shared",
          latestFileKey: decryptFileKey!,
          tags: secret.tags.map((tag) => tag.id),
          secretComment: secret.comment,
          secretReminderRepeatDays: secret.reminderRepeatDays,
          secretReminderNote: secret.reminderNote,
          skipMultilineEncoding: secret.skipMultilineEncoding,
          newSecretName: data.key
        });
      });

    await Promise.all(promises)
      .then(() => {
        createNotification({
          type: "success",
          text: "Successfully renamed the secret"
        });
      })
      .catch(() => {
        createNotification({
          type: "error",
          text: "Error renaming the secret"
        });
      });
  };

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      className="secret-table relative mb-2 flex w-full flex-row items-center justify-between overflow-hidden rounded-lg border border-solid border-mineshaft-700 bg-mineshaft-800 font-inter"
    >
      <div className="flex h-11 flex-1 flex-shrink-0 items-center">
        <span className="flex h-full min-w-[11rem] items-center justify-start border-r-2 border-mineshaft-600 px-4">
          Key
        </span>

        <Controller
          name="key"
          control={control}
          render={({ field }) => (
            <Input
              autoComplete="off"
              isReadOnly={isReadOnly}
              autoCapitalization={currentWorkspace?.autoCapitalization}
              variant="plain"
              isDisabled={isOverriden}
              {...field}
              className="w-full px-2 focus:text-bunker-100 focus:ring-transparent"
            />
          )}
        />
      </div>
      {(isReadOnly || isOverriden) && (
        <span className="mr-5 rounded-md bg-mineshaft-500 px-2">Read Only</span>
      )}
      <AnimatePresence exitBeforeEnter>
        {isDirty && (
          <motion.div
            key="options-save"
            className="flex h-10 flex-shrink-0 items-center space-x-4 px-3"
            initial={{ x: -10, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -10, opacity: 0 }}
          >
            <Tooltip content="Save">
              <IconButton
                ariaLabel="more"
                variant="plain"
                type="submit"
                size="md"
                className={twMerge(
                  "p-0 text-primary opacity-0 group-hover:opacity-100",
                  isDirty && "opacity-100"
                )}
                isDisabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Spinner className="m-0 h-4 w-4 p-0" />
                ) : (
                  <FontAwesomeIcon icon={faCheck} size="lg" className="text-primary" />
                )}
              </IconButton>
            </Tooltip>
            <Tooltip content="Cancel">
              <IconButton
                ariaLabel="more"
                variant="plain"
                size="md"
                className={twMerge(
                  "p-0 opacity-0 group-hover:opacity-100",
                  isDirty && "opacity-100"
                )}
                onClick={() => reset()}
                isDisabled={isSubmitting}
              >
                <FontAwesomeIcon icon={faClose} size="lg" />
              </IconButton>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}

export default SecretRenameRow;
