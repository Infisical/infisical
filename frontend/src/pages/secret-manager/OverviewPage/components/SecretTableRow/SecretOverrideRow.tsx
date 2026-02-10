import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { CopyIcon, EditIcon, GitBranchIcon, SaveIcon, TrashIcon, Undo2Icon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableIconButton
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useToggle } from "@app/hooks";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { SecretType } from "@app/hooks/api/types";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

type Props = {
  secretName: string;
  environment: string;
  secretPath: string;
  isVisible?: boolean;
  isEmpty?: boolean;
  idOverride?: string;
  valueOverride?: string;
  isCreatingOverride: boolean;
  onCreatingOverrideChange: (value: boolean) => void;
  onSecretCreate: (env: string, key: string, value: string, type?: SecretType) => Promise<void>;
  onSecretUpdate: (
    env: string,
    key: string,
    value: string,
    secretValueHidden: boolean,
    type?: SecretType,
    secretId?: string
  ) => Promise<void>;
  onSecretDelete: (env: string, key: string, secretId?: string, type?: SecretType) => Promise<void>;
};

export const SecretOverrideRow = ({
  secretName,
  environment,
  secretPath,
  isVisible,
  isEmpty,
  idOverride,
  valueOverride,
  isCreatingOverride,
  onCreatingOverrideChange,
  onSecretCreate,
  onSecretUpdate,
  onSecretDelete
}: Props) => {
  const { currentProject } = useProject();
  const [isOverrideFieldFocused, setIsOverrideFieldFocused] = useToggle();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const fetchOverrideValueParams = {
    environment,
    secretPath,
    secretKey: secretName,
    projectId: currentProject.id,
    isOverride: true
  };

  const canFetchOverrideValue = Boolean(idOverride) && !isEmpty;

  const {
    data: overrideValueData,
    isPending: isPendingOverrideValue,
    refetch: refetchOverrideValue
  } = useGetSecretValue(fetchOverrideValueParams, {
    enabled: canFetchOverrideValue && (isVisible || isOverrideFieldFocused)
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
      value: overrideValueData?.valueOverride ?? (valueOverride || null)
    }
  });

  useEffect(() => {
    if (overrideValueData && !isDirty) {
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
        await onSecretUpdate(
          environment,
          secretName,
          value,
          false,
          SecretType.Personal,
          idOverride
        );
      }
    }
    reset({ value });
  };

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
    <div className="flex w-full cursor-text items-center space-x-1.5 rounded py-1.5">
      <div className="flex shrink-0 items-center gap-1 text-xs text-override">
        <GitBranchIcon className="size-3.5" />
      </div>
      <div className="grow pr-2 pl-1">
        <Controller
          control={control}
          name="value"
          render={({ field }) => (
            <InfisicalSecretInput
              {...field}
              isReadOnly={isFetchingOverrideValue}
              value={isFetchingOverrideValue ? HIDDEN_SECRET_VALUE : (field.value as string)}
              key="secret-input-override"
              isVisible={isVisible}
              secretPath={secretPath}
              environment={environment}
              placeholder="Enter personal override..."
              onFocus={() => setIsOverrideFieldFocused.on()}
              onBlur={() => {
                field.onBlur();
                setIsOverrideFieldFocused.off();
              }}
            />
          )}
        />
      </div>
      <div className="flex w-fit items-start justify-end space-x-2 self-start pl-2 transition-all">
        {isDirty ? (
          <>
            <ProjectPermissionCan
              I={
                isCreatingOverride ? ProjectPermissionActions.Create : ProjectPermissionActions.Edit
              }
              a={subject(ProjectPermissionSub.Secrets, {
                environment,
                secretPath,
                secretName,
                secretTags: ["*"]
              })}
            >
              {(isAllowed) => (
                <div>
                  <Tooltip>
                    <TooltipTrigger>
                      <UnstableIconButton
                        size="xs"
                        variant="success"
                        isDisabled={isSubmitting || !isAllowed}
                        onClick={handleSubmit(handleFormSubmit)}
                      >
                        <SaveIcon />
                      </UnstableIconButton>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isCreatingOverride ? "Create Override" : "Save Override"}
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </ProjectPermissionCan>
            <div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <UnstableIconButton
                    variant="danger"
                    size="xs"
                    onClick={handleFormReset}
                    isDisabled={isSubmitting}
                  >
                    <Undo2Icon />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>
                  {isCreatingOverride ? "Remove Override" : "Undo Changes"}
                </TooltipContent>
              </Tooltip>
            </div>
          </>
        ) : (
          <div className="flex items-center space-x-1.5">
            <Tooltip delayDuration={300} disableHoverableContent>
              <TooltipTrigger>
                <UnstableIconButton
                  onClick={() => {
                    setFocus("value", { shouldSelect: true });
                  }}
                  variant="ghost"
                  size="xs"
                  className={twMerge(
                    "w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100"
                  )}
                >
                  <EditIcon />
                </UnstableIconButton>
              </TooltipTrigger>
              <TooltipContent>Edit Override</TooltipContent>
            </Tooltip>
            {!isCreatingOverride && (
              <Tooltip delayDuration={300} disableHoverableContent>
                <TooltipTrigger>
                  <UnstableIconButton
                    isDisabled={!canFetchOverrideValue}
                    onClick={handleCopyOverrideToClipboard}
                    variant="ghost"
                    size="xs"
                    className={twMerge(
                      "w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100"
                    )}
                  >
                    <CopyIcon />
                  </UnstableIconButton>
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
            <Tooltip delayDuration={300} disableHoverableContent>
              <TooltipTrigger>
                <UnstableIconButton
                  onClick={
                    isCreatingOverride
                      ? () => {
                          onCreatingOverrideChange(false);
                          reset({ value: null });
                        }
                      : () => setIsDeleteDialogOpen(true)
                  }
                  variant="ghost"
                  size="xs"
                  className={twMerge(
                    "w-0 overflow-hidden opacity-0 group-hover:w-7 group-hover:opacity-100 hover:text-danger"
                  )}
                >
                  <TrashIcon />
                </UnstableIconButton>
              </TooltipTrigger>
              <TooltipContent>
                {isCreatingOverride ? "Cancel Override" : "Remove Override"}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
};
