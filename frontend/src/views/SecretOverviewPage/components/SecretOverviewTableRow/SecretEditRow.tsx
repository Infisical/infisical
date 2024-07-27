import { useState, useCallback } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faCheck, faCopy, faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { IconButton, Tooltip, DeleteActionModal } from "@app/components/v2";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useToggle } from "@app/hooks";
import { SecretType } from "@app/hooks/api/types";

type Props = {
  defaultValue?: string | null;
  secretName: string;
  secretId?: string;
  isOverride?: boolean;
  isCreatable?: boolean;
  isVisible?: boolean;
  isImportedSecret: boolean;
  environment: string;
  secretPath: string;
  onSecretCreate: (env: string, key: string, value: string) => Promise<void>;
  onSecretUpdate: (
    env: string,
    key: string,
    value: string,
    type?: SecretType,
    secretId?: string
  ) => Promise<void>;
  onSecretDelete: (env: string, key: string, secretId?: string) => Promise<void>;
};

export const SecretEditRow = ({
  defaultValue,
  isCreatable,
  isOverride,
  isImportedSecret,
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
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const toggleModal = useCallback(() => {
    setIsModalOpen((prev) => !prev)
  }, [])

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
        await onSecretUpdate(
          environment,
          secretName,
          value,
          isOverride ? SecretType.Personal : SecretType.Shared,
          secretId
        );
      }
    }
    reset({ value });
  };

  const handleDeleteSecret = useCallback(async () => {
    setIsDeleting.on();
    setIsModalOpen(false);

    try {
      await onSecretDelete(environment, secretName, secretId);
      reset({ value: null });
    } finally {
      setIsDeleting.off();
    }
  }, [onSecretDelete, environment, secretName, secretId, reset, setIsDeleting]);

  return (
    <div className="group flex w-full cursor-text items-center space-x-2">

      <DeleteActionModal
        isOpen={isModalOpen}
        onClose={toggleModal}
        title="Do you want to delete the selected secret?"
        deleteKey="delete"
        onDeleteApproved={handleDeleteSecret}
      />

      <div className="flex-grow border-r border-r-mineshaft-600 pr-2 pl-1">
        <Controller
          disabled={isImportedSecret && !defaultValue}
          control={control}
          name="value"
          render={({ field }) => (
            <InfisicalSecretInput
              {...field}
              isReadOnly={isImportedSecret}
              value={field.value as string}
              key="secret-input"
              isVisible={isVisible}
              secretPath={secretPath}
              environment={environment}
              isImport={isImportedSecret}
            />
          )}
        />
      </div>
      <div
        className={twMerge(
          "flex w-16 justify-center space-x-3 pl-2 transition-all",
          isImportedSecret && "pointer-events-none opacity-0"
        )}
      >
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
                      onClick={toggleModal}
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
