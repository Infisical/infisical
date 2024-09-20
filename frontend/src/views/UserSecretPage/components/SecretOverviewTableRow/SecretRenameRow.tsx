import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faCheck, faClose, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { IconButton, Input, Spinner, Tooltip } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { useToggle } from "@app/hooks";
import { useUpdateSecretV3 } from "@app/hooks/api";
import { SecretType,SecretV3RawSanitized } from "@app/hooks/api/types";
import { SecretActionType } from "@app/views/SecretMainPage/components/SecretListView/SecretListView.utils";

type Props = {
  secretKey: string;
  secretPath: string;
  environments: { name: string; slug: string }[];
  getSecretByKey: (slug: string, key: string) => SecretV3RawSanitized | undefined;
};

export const formSchema = z.object({
  key: z.string().trim().min(1, { message: "Secret key is required" })
});

type TFormSchema = z.infer<typeof formSchema>;

function SecretRenameRow({ environments, getSecretByKey, secretKey, secretPath }: Props) {
  const { currentWorkspace } = useWorkspace();
  const { permission } = useProjectPermission();

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

  const [isSecNameCopied, setIsSecNameCopied] = useToggle(false);

  const { mutateAsync: updateSecretV3 } = useUpdateSecretV3();

  const {
    handleSubmit,
    control,
    reset,
    trigger,
    getValues,
    formState: { isDirty, isSubmitting, errors }
  } = useForm<TFormSchema>({
    defaultValues: { key: secretKey },
    values: { key: secretKey },
    resolver: zodResolver(formSchema)
  });

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isSecNameCopied) {
      timer = setTimeout(() => setIsSecNameCopied.off(), 2000);
    }
    return () => clearTimeout(timer);
  }, [isSecNameCopied]);

  const handleFormSubmit = async (data: TFormSchema) => {
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
          secretKey: secret.key,
          secretValue: secret.value || "",
          type: SecretType.Shared,
          tagIds: secret.tags?.map((tag) => tag.id),
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

  const copyTokenToClipboard = () => {
    const [key] = getValues(["key"]);
    navigator.clipboard.writeText(key as string);
    setIsSecNameCopied.on();
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
          render={({ field, fieldState: { error } }) => (
            <Input
              autoComplete="off"
              isReadOnly={isReadOnly}
              autoCapitalization={currentWorkspace?.autoCapitalization}
              variant="plain"
              isDisabled={isOverriden}
              placeholder={error?.message}
              onKeyUp={() => trigger("key")}
              isError={Boolean(error)}
              {...field}
              className="w-full px-2 placeholder:text-red-500 focus:text-bunker-100 focus:ring-transparent"
            />
          )}
        />
      </div>

      {isReadOnly || isOverriden ? (
        <span className="mr-5 rounded-md bg-mineshaft-500 px-2">Read Only</span>
      ) : (
        <div className="group flex w-20 items-center justify-center border-l border-mineshaft-500 py-1">
          <AnimatePresence exitBeforeEnter>
            {!isDirty ? (
              <motion.div
                key="options"
                className="flex flex-shrink-0 items-center space-x-4 px-3"
                initial={{ x: 0, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 10, opacity: 0 }}
              >
                <Tooltip content="Copy secret name">
                  <IconButton
                    ariaLabel="copy-value"
                    variant="plain"
                    size="sm"
                    className="p-0 opacity-0 group-hover:opacity-100"
                    onClick={copyTokenToClipboard}
                  >
                    <FontAwesomeIcon icon={isSecNameCopied ? faCheck : faCopy} />
                  </IconButton>
                </Tooltip>
              </motion.div>
            ) : (
              <motion.div
                key="options-save"
                className="flex flex-shrink-0 items-center space-x-4 px-3"
                initial={{ x: -10, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -10, opacity: 0 }}
              >
                <Tooltip content={errors.key ? errors.key.message : "Save"}>
                  <IconButton
                    ariaLabel="more"
                    variant="plain"
                    type="submit"
                    size="md"
                    className={twMerge(
                      "p-0 text-primary opacity-0 group-hover:opacity-100",
                      isDirty && "opacity-100"
                    )}
                    isDisabled={isSubmitting || Boolean(errors.key)}
                  >
                    {isSubmitting ? (
                      <Spinner className="m-0 h-4 w-4 p-0" />
                    ) : (
                      <FontAwesomeIcon
                        icon={faCheck}
                        size="lg"
                        className={twMerge("text-primary", errors.key && "text-mineshaft-400")}
                      />
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
        </div>
      )}
    </form>
  );
}

export default SecretRenameRow;
