import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import { useToggle } from "@app/hooks";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { useCopySecretToClipBoard } from "@app/hooks/secret-operations/useCopySecretToClipboard";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { InlineActionIconButton } from "@app/components/v2/IconButton/InlineActionIconButton";
import { useCreateSharedSecretPopup } from "@app/hooks/secret-operations/useCreateSharedSecret";
import { useHandleSecretOperation } from "@app/hooks/secret-operations/useHandleSecretOperation";
import { SecretType } from "@app/hooks/api/types";
import { createNotification } from "@app/components/notifications";

import { FontAwesomeSpriteName } from "../SecretListView/SecretListView.utils";

export interface SecretOverrideView {
  secretPath: string;
  secretKey: string;
  environment: string;
  projectId: string;
  isVisible?: boolean;
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
  isVisible
}: SecretOverrideView) {
  const [isFieldFocused, setIsFieldFocused] = useToggle();
  const handleSecretOperation = useHandleSecretOperation(projectId);

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

  const deletePersonalSecret = useCallback(() => {
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
    <div className="group flex">
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
      <div className="flex">
        <InlineActionIconButton
          isHidden={isDirty}
          revealOnGroupHover
          hint="Copy override"
          onClick={copySecretToClipboard}
          icon={
            isSecretValueCopied ? FontAwesomeSpriteName.Check : FontAwesomeSpriteName.ClipboardCopy
          }
        />
        <InlineActionIconButton
          isHidden={isDirty}
          revealOnGroupHover
          hint="Share override"
          onClick={openCreateSharedSecretPopup}
          icon={FontAwesomeSpriteName.ShareSecret}
        />
        <InlineActionIconButton
          isHidden={!isDirty}
          hint="Save"
          onClick={handleSubmit(submitForm)}
          isDisabled={isSubmitting}
          icon={FontAwesomeSpriteName.Check}
        />
        <InlineActionIconButton
          isHidden={!isDirty}
          hint="cancel"
          icon={FontAwesomeSpriteName.Close}
          isDisabled={isSubmitting}
          onClick={() => reset()}
          className="hover:text-red"
        />
        <InlineActionIconButton
          isHidden={isDirty}
          revealOnGroupHover
          hint="Remove Personal Override"
          onClick={deletePersonalSecret}
          className="hover:text-red"
          icon={FontAwesomeSpriteName.Trash}
        />
      </div>
    </div>
  );
}
