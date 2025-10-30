import { useCallback, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  faCheck,
  faClose,
  faCodeBranch,
  faCopy,
  faShare,
  faTrash,
  faUser
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, Tooltip } from "@app/components/v2";
import { InlineActionIconButton } from "@app/components/v2/IconButton/InlineActionIconButton";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import { useToggle } from "@app/hooks";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { SecretType } from "@app/hooks/api/types";
import { useCopySecretToClipBoard } from "@app/hooks/secret-operations/useCopySecretToClipboard";
import { useCreateSharedSecretPopup } from "@app/hooks/secret-operations/useCreateSharedSecret";
import { useHandleSecretOperation } from "@app/hooks/secret-operations/useHandleSecretOperation";

export interface SecretOverrideView {
  secretPath: string;
  secretKey: string;
  environment: string;
  projectId: string;
  isVisible?: boolean;
  className?: string;
}

const personalSecretFormSchema = z.object({
  valueOverride: z.string()
});

type TPersonSecretForm = z.infer<typeof personalSecretFormSchema>;

export function SecretPersonalOverrideView({
  secretKey,
  secretPath,
  environment,
  projectId,
  isVisible,
  className
}: SecretOverrideView) {
  const [isFieldFocused, setIsFieldFocused] = useToggle();
  const handleSecretOperation = useHandleSecretOperation(projectId);
  const [isDeleteModalOpen, toggleDeleteModal] = useToggle();

  const getSecretParams = {
    secretKey,
    secretPath,
    environment,
    projectId,
    isOverride: true
  };

  const {
    data: secretValueData,
    isPending: isSecretLoading,
    isError: isErrorFetchingSecretValue
  } = useGetSecretValue(getSecretParams, {
    enabled: isVisible || isFieldFocused
  });

  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    reset,
    formState: { isDirty, isSubmitting }
  } = useForm<TPersonSecretForm>({
    async defaultValues() {
      if (secretValueData) {
        return {
          valueOverride: secretValueData.valueOverride || ""
        };
      }
      return {
        valueOverride: ""
      };
    },
    resolver: zodResolver(personalSecretFormSchema)
  });

  const openCreateSharedSecretPopup = useCreateSharedSecretPopup({
    getFetchedValue: () => getValues("valueOverride"),
    fetchSecretParams: getSecretParams
  });

  useEffect(() => {
    if (secretValueData?.valueOverride && !isDirty) {
      setValue("valueOverride", secretValueData.valueOverride);
    }
  });

  const { copySecretToClipboard, isSecretValueCopied } = useCopySecretToClipBoard({
    getFetchedValue: () => getValues("valueOverride"),
    fetchSecretParams: getSecretParams
  });

  const submitForm = useCallback(
    (update: TPersonSecretForm) => {
      handleSecretOperation(
        {
          operation: "update",
          environment,
          key: secretKey,
          secretPath,
          type: SecretType.Personal
        },
        {
          value: update.valueOverride
        }
      )
        .then(() => {
          reset();
          createNotification({
            type: "success",
            text: "Successfully saved secret override"
          });
        })
        .catch((e) => {
          console.error(e);
          createNotification({
            type: "error",
            text: "Error saving secret override"
          });
        });
    },
    [environment, secretKey, secretPath]
  );

  const deletePersonalSecret = useCallback(async () => {
    handleSecretOperation({
      operation: "delete",
      environment,
      key: secretKey,
      secretPath,
      type: SecretType.Personal
    })
      .then(() =>
        createNotification({
          type: "success",
          text: "Successfully removed secret override"
        })
      )
      .catch((e) => {
        console.error(e);
        createNotification({
          type: "error",
          text: "Error removing secret override"
        });
      });
  }, []);

  return (
    <div className={clsx("group flex items-center", className)}>
      <Tooltip content="Personal Override">
        <span className="ml-1 flex cursor-default gap-1">
          <FontAwesomeIcon className="rotate-90" icon={faCodeBranch} />
          <FontAwesomeIcon icon={faUser} />
        </span>
      </Tooltip>
      <Controller
        control={control}
        name="valueOverride"
        key="secret-override"
        render={({ field }) => (
          <InfisicalSecretInput
            key="secret-override"
            isVisible={isVisible || isFieldFocused}
            isLoadingValue={isSecretLoading}
            isErrorLoadingValue={isErrorFetchingSecretValue}
            secretPath={secretPath}
            environment={environment}
            {...field}
            onFocus={() => {
              setIsFieldFocused.on();
            }}
            onBlur={() => {
              setIsFieldFocused.off();
              field.onBlur();
            }}
            containerClassName="py-1.5 rounded-md transition-all grow"
          />
        )}
      />
      <div className="flex items-center space-x-3">
        <InlineActionIconButton
          isHidden={isDirty}
          revealOnGroupHover
          hint="Copy override"
          onClick={copySecretToClipboard}
          icon={isSecretValueCopied ? faCheck : faCopy}
        />
        <InlineActionIconButton
          isHidden={isDirty}
          revealOnGroupHover
          hint="Share override"
          onClick={openCreateSharedSecretPopup}
          icon={faShare}
        />
        <InlineActionIconButton
          isHidden={!isDirty}
          hint="Save"
          onClick={handleSubmit(submitForm)}
          isDisabled={isSubmitting}
          icon={faCheck}
        />
        <InlineActionIconButton
          isHidden={!isDirty}
          hint="cancel"
          icon={faClose}
          isDisabled={isSubmitting}
          onClick={() => reset()}
          className="hover:text-red"
        />
        <InlineActionIconButton
          isHidden={isDirty}
          revealOnGroupHover
          hint="Remove Personal Override"
          onClick={() => toggleDeleteModal.on()}
          className="hover:text-red"
          icon={faTrash}
        />
      </div>
      <DeleteActionModal
        isOpen={isDeleteModalOpen}
        onClose={() => toggleDeleteModal.off()}
        title="Do you want to delete your personal override for the selected secret?"
        deleteKey={secretKey}
        onDeleteApproved={deletePersonalSecret}
      />
    </div>
  );
}
