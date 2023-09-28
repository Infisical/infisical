import { Controller, useForm, useWatch } from "react-hook-form";
import { faCheck, faCopy, faTrash, faXmark, faCodeBranch } from "@fortawesome/free-solid-svg-icons";
import { subject } from "@casl/ability";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect } from "react";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import { IconButton, SecretInput, Tooltip } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useToggle } from "@app/hooks";

type Props = {
  defaultValue?: string | null;
  overriddenValue?: string | null;
  overrideAction?: string | null;
  idOverride?: string | null;
  secretName: string;
  isCreatable?: boolean;
  isVisible?: boolean;
  environment: string;
  secretPath: string;
  onSecretCreate: (env: string, key: string, value: string, type: string) => Promise<void>;
  onSecretUpdate: (env: string, key: string, value: string, type: string) => Promise<void>;
  onSecretDelete: (env: string, key: string, type: string) => Promise<void>;
};

export enum SecretActionType {
  Created = "created",
  Modified = "modified",
  Deleted = "deleted"
}

export const SecretEditRow = ({
  defaultValue,
  overriddenValue,
  overrideAction,
  idOverride,
  isCreatable,
  onSecretUpdate,
  secretName,
  onSecretCreate,
  onSecretDelete,
  environment,
  secretPath,
  isVisible
}: Props) => {
  const {
    handleSubmit,
    control,
    reset,
    setValue,
    getValues,
    formState: { isDirty, isSubmitting }
  } = useForm({
    values: {
      value: defaultValue,
      valueOverride: overriddenValue,
      overrideAction,
      idOverride
    }
  });
  const [isDeleting, setIsDeleting] = useToggle();
  const { createNotification } = useNotificationContext();

  const watchOverrideAction = useWatch({
    control,
    name: "overrideAction",
    exact: true
  });

  const watchIdOverride = useWatch({
    control,
    name: "idOverride",
    exact: true
  })

  const handleFormReset = () => {
    reset({}, { keepValues: false });
  };

  const handleCopySecretToClipboard = async () => {
    const { value } = getValues();
    if (value) {
      try {
        await window.navigator.clipboard.writeText(value);
        createNotification({ type: "success", text: "Copied secret to clipboard" });
      } catch (error) {
        console.log(error);
        createNotification({ type: "error", text: "Failed to copy secret to clipboard" });
      }
    }
  };

  const isOverridden =
      watchOverrideAction === SecretActionType.Created || watchOverrideAction === SecretActionType.Modified;

  const handleFormSubmit = async ({ value, valueOverride }: { value?: string | null, valueOverride?: string | null }) => {
    const type = isOverridden ? "personal" : "shared";
    const secretValue = isOverridden ? valueOverride : value;

    // when changing from personal override to shared secret
    if (watchOverrideAction === SecretActionType.Deleted) {
      await onSecretDelete(environment, secretName, "personal");
      reset({valueOverride: undefined}, { keepValues: false });
    }

    if ((secretValue || secretValue === "") && secretName) {
      if (isCreatable || watchOverrideAction === SecretActionType.Created) {
        await onSecretCreate(environment, secretName, secretValue, type);
      } else {
        await onSecretUpdate(environment, secretName, secretValue, type);
      }
    }
    reset({ value, valueOverride });
  };

  const handleDeleteSecret = async () => {
    const type = isOverridden ? "personal" : "shared";
    setIsDeleting.on();
    try {
      await onSecretDelete(environment, secretName, type);
      reset({ value: undefined });
    } finally {
      setIsDeleting.off();
    }
  };

  const onSecretOverride = () => {
    if (isOverridden) {
      // when user created a new override but then removes
      if (watchOverrideAction === SecretActionType.Created)
        setValue("valueOverride", "");
      setValue("overrideAction", SecretActionType.Deleted, {
        shouldDirty: true
      });
    } else {
      setValue("valueOverride", "");
      setValue(
        "overrideAction",
        watchIdOverride ? SecretActionType.Modified : SecretActionType.Created,
        { shouldDirty: true }
      );
    }
  };

  useEffect(() => {
    reset({}, { keepValues: false });
  }, [overriddenValue])

  return (
    <div className="group flex w-full cursor-text space-x-2 items-center">
      <div className="flex-grow border-r border-r-mineshaft-600 pr-2 pl-1">
        {isOverridden ? (
          <Controller
            key="valueOverride"
            control={control}
            name="valueOverride"
            render={({ field }) => <SecretInput key="valueOverride" {...field} isVisible={isVisible} />}
          />
        ) : (
          <Controller
            key="value"
            control={control}
            name="value"
            render={({ field }) => <SecretInput key="value" {...field} isVisible={isVisible} />}
          />
        )}
      </div>
      <div className="flex w-16 justify-center space-x-1.5 transition-all">
        {isDirty ? (
          <>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
            >
              {(isAllowed) => (
                <div>
                  <Tooltip content="save">
                    <IconButton
                      variant="plain"
                      ariaLabel="submit-value"
                      className="h-full"
                      isDisabled={isSubmitting || !isAllowed}
                      onClick={handleSubmit(handleFormSubmit)}
                    >
                      <FontAwesomeIcon icon={faCheck} />
                    </IconButton>
                  </Tooltip>
                </div>
              )}
            </ProjectPermissionCan>
            <div>
              <Tooltip content="cancel">
                <IconButton
                  variant="plain"
                  ariaLabel="reset-value"
                  className="h-full"
                  onClick={handleFormReset}
                  isDisabled={isSubmitting}
                >
                  <FontAwesomeIcon icon={faXmark} />
                </IconButton>
              </Tooltip>
            </div>
          </>
        ) : (
          <>
            <div className="opacity-0 group-hover:opacity-100">
              <Tooltip content="Copy Secret">
                <IconButton
                  ariaLabel="copy-value"
                  onClick={handleCopySecretToClipboard}
                  variant="plain"
                  className="h-full"
                >
                  <FontAwesomeIcon icon={faCopy} />
                </IconButton>
              </Tooltip>
            </div>
            {!isCreatable && 
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
              >
                {(isAllowed) => (
                  <div className="opacity-0 group-hover:opacity-100">
                    <Tooltip content="Override with a personal value">
                      <IconButton
                        variant="plain"
                        className={isOverridden ? "text-primary" : ""}
                        onClick={onSecretOverride}
                        isDisabled={isSubmitting || !isAllowed}
                        ariaLabel="info"
                      >
                        <FontAwesomeIcon icon={faCodeBranch} />
                      </IconButton>
                    </Tooltip>
                  </div>
                )}
              </ProjectPermissionCan>
            }
            <ProjectPermissionCan
              I={ProjectPermissionActions.Delete}
              a={ProjectPermissionSub.Secrets}
            >
              {(isAllowed) => (
                <div className="opacity-0 group-hover:opacity-100">
                  <Tooltip content="Delete">
                    <IconButton
                      variant="plain"
                      ariaLabel="delete-value"
                      className="h-full"
                      onClick={handleDeleteSecret}
                      isDisabled={isDeleting || !isAllowed}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </IconButton>
                  </Tooltip>
                </div>
              )}
            </ProjectPermissionCan>
          </>
        )}
      </div>
    </div>
  );
};
