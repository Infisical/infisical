import { Controller, useForm, useWatch } from "react-hook-form";
import { faCheck, faCopy, faTrash, faXmark, faCodeBranch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { IconButton, SecretInput, Tooltip } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { SecretActionType } from "./SecretOverviewTableRow";

type Props = {
  defaultValue?: string | null;
  overriddenValue?: string | null;
  overrideAction?: string | null;
  idOverride?: string | null;
  secretName: string;
  isCreatable?: boolean;
  isVisible?: boolean;
  environment: string;
  onSecretCreate: (env: string, key: string, value: string, type: string) => Promise<void>;
  onSecretUpdate: (env: string, key: string, value: string, type: string) => Promise<void>;
  onSecretDelete: (env: string, key: string, type: string) => Promise<void>;
};

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
    reset();
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
    value = isOverridden ? valueOverride : value;

    // when changing from personal override to shared secret
    if (watchOverrideAction === SecretActionType.Deleted) {
      await onSecretDelete(environment, secretName, 'personal');
    }

    if ((value || value === "") && secretName) {
      if (isCreatable || watchOverrideAction === SecretActionType.Created) {
        await onSecretCreate(environment, secretName, value, type);
      } else {
        await onSecretUpdate(environment, secretName, value, type);
      }
    }
    reset({ value });
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
      setValue(`overrideAction`, SecretActionType.Deleted, {
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
      <div className="flex w-16 justify-center space-x-3 pl-2 transition-all">
        {isDirty ? (
          <>
            <div>
              <Tooltip content="save">
                <IconButton
                  variant="plain"
                  ariaLabel="submit-value"
                  className="h-full"
                  isDisabled={isSubmitting}
                  onClick={handleSubmit(handleFormSubmit)}
                >
                  <FontAwesomeIcon icon={faCheck} />
                </IconButton>
              </Tooltip>
            </div>
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
            <div className="opacity-0 group-hover:opacity-100">
              <Tooltip content="Override with a personal value">
                <IconButton
                  variant="plain"
                  className={isOverridden ? "text-primary" : ""}
                  onClick={onSecretOverride}
                  ariaLabel="info"
                >
                  <FontAwesomeIcon icon={faCodeBranch} />
                </IconButton>
                </Tooltip>
            </div>
            <div className="opacity-0 group-hover:opacity-100">
              <Tooltip content="Delete">
                <IconButton
                  variant="plain"
                  ariaLabel="delete-value"
                  className="h-full"
                  onClick={handleDeleteSecret}
                  isDisabled={isDeleting}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              </Tooltip>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
