import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { CopyIcon, GitBranchIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  IconButton,
  InfisicalSecretInput,
  SecretInputActions,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useSecretInputActionShortcuts
} from "@app/components/v3";
import { HIDDEN_SECRET_VALUE } from "@app/const/secrets";
import { useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { SecretType } from "@app/hooks/api/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";

type Props = {
  secretName: string;
  environment: string;
  secretPath: string;
  isVisible?: boolean;
  isOverrideEmpty?: boolean;
  idOverride?: string;
  valueOverride?: string;
  isCreatingOverride: boolean;
  onCreatingOverrideChange: (value: boolean) => void;
  onSecretCreate: (env: string, key: string, value: string, type?: SecretType) => Promise<void>;
  onSecretUpdate: (params: {
    env: string;
    key: string;
    value: string | undefined;
    secretValueHidden: boolean;
    type?: SecretType;
    secretId?: string;
    newSecretName?: string;
    secretComment?: string;
    tags?: { id: string; slug: string }[];
    secretMetadata?: { key: string; value: string; isEncrypted?: boolean }[];
    skipMultilineEncoding?: boolean | null;
    originalValue?: string;
  }) => Promise<void>;
  onSecretDelete: (env: string, key: string, secretId?: string, type?: SecretType) => Promise<void>;
  isSingleEnvView?: boolean;
};

export const SecretOverrideRow = ({
  secretName,
  environment,
  secretPath,
  isVisible,
  isOverrideEmpty,
  idOverride,
  valueOverride,
  isCreatingOverride,
  onCreatingOverrideChange,
  onSecretCreate,
  onSecretUpdate,
  onSecretDelete,
  isSingleEnvView
}: Props) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  // personal overrides are only visible to their owner, so describe access on the secret suffices to manage them
  const canSaveOverride = hasSecretReadValueOrDescribePermission(
    permission,
    ProjectPermissionSecretActions.DescribeSecret,
    { environment, secretPath, secretName, secretTags: ["*"] }
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const fetchOverrideValueParams = {
    environment,
    secretPath,
    secretKey: secretName,
    projectId: currentProject.id,
    isOverride: true
  };

  const canFetchOverrideValue = Boolean(idOverride) && !isOverrideEmpty;

  const {
    data: overrideValueData,
    isPending: isPendingOverrideValue,
    refetch: refetchOverrideValue
  } = useGetSecretValue(fetchOverrideValueParams, {
    enabled: canFetchOverrideValue && Boolean(isVisible)
  });

  const isFetchingOverrideValue = canFetchOverrideValue && isPendingOverrideValue;

  const {
    handleSubmit,
    control,
    reset,
    setValue,
    setFocus,
    formState: { isDirty, isSubmitting }
  } = useForm({
    defaultValues: {
      value: isOverrideEmpty
        ? valueOverride || null
        : (overrideValueData?.valueOverride ?? (valueOverride || null))
    }
  });

  useEffect(() => {
    if (overrideValueData && !isDirty && !isOverrideEmpty) {
      setValue("value", overrideValueData.valueOverride ?? null);
    }
  }, [overrideValueData]);

  const handleFormReset = () => {
    if (isCreatingOverride) {
      onCreatingOverrideChange(false);
      reset({ value: null });
    } else {
      reset({ value: overrideValueData?.valueOverride ?? (valueOverride || null) });
    }
  };

  const handleCopyOverrideToClipboard = async () => {
    try {
      const { data } = await refetchOverrideValue();
      await window.navigator.clipboard.writeText(data?.valueOverride ?? "");
      createNotification({ type: "success", text: "Copied override to clipboard" });
    } catch (e) {
      console.error(e);
      createNotification({
        type: "error",
        text: "Failed to fetch override value."
      });
    }
  };

  const handleFormSubmit = async ({ value }: { value?: string | null }) => {
    if ((value || value === "") && secretName) {
      if (isCreatingOverride) {
        await onSecretCreate(environment, secretName, value, SecretType.Personal);
        // Don't clear isCreatingOverride here — the parent will clean it up
        // once the query refetch confirms the override exists (hasOverride becomes true).
        // This prevents the override row from flickering on create.
      } else {
        await onSecretUpdate({
          env: environment,
          key: secretName,
          value,
          secretValueHidden: false,
          type: SecretType.Personal,
          secretId: idOverride
        });
      }
    }
    reset({ value });
  };

  const submitForm = handleSubmit(handleFormSubmit);
  const handleActionShortcut = useSecretInputActionShortcuts({
    isActive: isDirty,
    isDisabled: isSubmitting,
    isSaveDisabled: !canSaveOverride,
    onSave: submitForm,
    onUndo: handleFormReset
  });

  const handleDeleteOverride = useCallback(async () => {
    if (idOverride) {
      await onSecretDelete(environment, secretName, idOverride, SecretType.Personal);
      reset({ value: null });
      onCreatingOverrideChange(false);
    }
  }, [onSecretDelete, environment, secretName, idOverride, reset, onCreatingOverrideChange]);

  // Expose reset for parent to call when triggering "Add Override"
  // The parent sets isCreatingOverride=true and we reset the form here
  useEffect(() => {
    if (isCreatingOverride) {
      reset({ value: null });
      setValue("value", "", { shouldDirty: true });
      setTimeout(() => setFocus("value"), 250);
    }
  }, [isCreatingOverride]);

  return (
    <div className="flex w-full cursor-text items-center gap-2">
      {!isSingleEnvView && (
        <div className="flex shrink-0 items-center text-override">
          <GitBranchIcon className="size-3.5" />
        </div>
      )}
      <div className="min-w-0 grow">
        <Controller
          control={control}
          name="value"
          render={({ field }) => (
            <InfisicalSecretInput
              {...field}
              variant="plain"
              isReadOnly={isFetchingOverrideValue}
              value={isFetchingOverrideValue ? HIDDEN_SECRET_VALUE : (field.value as string)}
              key="secret-input-override"
              isVisible={isVisible}
              secretPath={secretPath}
              environment={environment}
              containerClassName="[&_[aria-hidden]]:!text-override"
              placeholder="Enter personal override..."
              onFocus={() => {
                if (canFetchOverrideValue && !overrideValueData) refetchOverrideValue();
              }}
              onBlur={field.onBlur}
              onKeyDown={handleActionShortcut}
            />
          )}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isDirty ? (
          <SecretInputActions
            className={isSingleEnvView ? "mr-1" : "-mr-1.5"}
            isSaveDisabled={isSubmitting || !canSaveOverride}
            isUndoDisabled={isSubmitting}
            saveLabel={isCreatingOverride ? "Create override" : "Save override"}
            undoLabel={isCreatingOverride ? "Cancel override" : "Undo changes"}
            onSave={submitForm}
            onUndo={handleFormReset}
          />
        ) : (
          <>
            {!isCreatingOverride && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    aria-label="Copy Override"
                    isDisabled={!canFetchOverrideValue}
                    onClick={handleCopyOverrideToClipboard}
                    variant="ghost-muted"
                    size="xs"
                  >
                    <CopyIcon />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>Copy Override</TooltipContent>
              </Tooltip>
            )}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia>
                    <TrashIcon />
                  </AlertDialogMedia>
                  <AlertDialogTitle>Remove Override</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to remove this personal override? The shared secret value
                    will be used instead.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="danger" onClick={handleDeleteOverride}>
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label={isCreatingOverride ? "Cancel Override" : "Remove Override"}
                  onClick={
                    isCreatingOverride
                      ? () => {
                          onCreatingOverrideChange(false);
                          reset({ value: null });
                        }
                      : () => setIsDeleteDialogOpen(true)
                  }
                  variant="ghost-muted"
                  size="xs"
                  className="hover:text-danger"
                >
                  <TrashIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>
                {isCreatingOverride ? "Cancel Override" : "Remove Override"}
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
};
