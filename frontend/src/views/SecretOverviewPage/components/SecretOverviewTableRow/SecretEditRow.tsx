import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faCheck, faCopy, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import { IconButton, SecretInput, Tooltip } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useToggle } from "@app/hooks";

type Props = {
  defaultValue?: string | null;
  secretName: string;
  secretId?: string;
  isCreatable?: boolean;
  isVisible?: boolean;
  environment: string;
  secretPath: string;
  onSecretCreate: (env: string, key: string, value: string) => Promise<void>;
  onSecretUpdate: (env: string, key: string, value: string, secretId?: string) => Promise<void>;
  onSecretDelete: (env: string, key: string, secretId?: string) => Promise<void>;
};

export const SecretEditRow = ({
  defaultValue,
  isCreatable,
  onSecretUpdate,
  secretName,
  onSecretCreate,
  onSecretDelete,
  environment,
  secretPath,
  isVisible,
  secretId
}: Props) => {
  const {
    handleSubmit,
    control,
    reset,
    getValues,
    formState: { isDirty, isSubmitting }
  } = useForm({
    values: {
      value: defaultValue || null
    }
  });
  const [isDeleting, setIsDeleting] = useToggle();
  const { createNotification } = useNotificationContext();

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

  const handleFormSubmit = async ({ value }: { value?: string | null }) => {
    if ((value || value === "") && secretName) {
      if (isCreatable) {
        await onSecretCreate(environment, secretName, value);
      } else {
        await onSecretUpdate(environment, secretName, value, secretId);
      }
    }
    reset({ value });
  };

  const handleDeleteSecret = async () => {
    setIsDeleting.on();
    try {
      await onSecretDelete(environment, secretName, secretId);
      reset({ value: null });
    } finally {
      setIsDeleting.off();
    }
  };

  return (
    <div className="group flex w-full cursor-text space-x-2 items-center">
      <div className="flex-grow border-r border-r-mineshaft-600 pr-2 pl-1">
        <Controller
          control={control}
          name="value"
          render={({ field }) => (
            <SecretInput {...field} value={field.value as string} isVisible={isVisible} />
          )}
        />
      </div>
      <div className="flex w-16 justify-center space-x-3 pl-2 transition-all">
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
                  colorSchema="danger"
                  ariaLabel="reset-value"
                  className="h-full"
                  onClick={handleFormReset}
                  isDisabled={isSubmitting}
                >
                  <FontAwesomeIcon icon={faXmark} className="hover:text-red" />
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
