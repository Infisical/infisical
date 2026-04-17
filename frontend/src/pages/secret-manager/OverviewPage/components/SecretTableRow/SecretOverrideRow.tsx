import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import {
  CopyIcon,
  EditIcon,
  EllipsisIcon,
  GitBranchIcon,
  SaveIcon,
  TrashIcon,
  Undo2Icon
} from "lucide-react";
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
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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
  const [isOverrideFieldFocused, setIsOverrideFieldFocused] = useToggle();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isHoveringActionZone, setIsHoveringActionZone] = useState(false);
  const showMenuWhileFocused = isHoveringActionZone || isDeleteDialogOpen;

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
    <div className="relative flex w-full cursor-text items-center space-x-1.5 rounded py-1.5">
      {!isSingleEnvView && (
        <div className="mr-1 flex shrink-0 items-center gap-1 text-xs text-override">
          <GitBranchIcon className="size-3.5" />
        </div>
      )}
      <div className={twMerge("grow pr-2", isOverrideFieldFocused && "pr-14")}>
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
      {isDirty && (
        <div
          className={twMerge(
            "absolute z-20 flex items-center gap-1.5 px-0.5 py-0.5",
            isSingleEnvView ? "-top-[1.5px] -right-2.5" : "top-[0px] -right-1.5"
          )}
        >
          <ProjectPermissionCan
            I={isCreatingOverride ? ProjectPermissionActions.Create : ProjectPermissionActions.Edit}
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
                    <IconButton
                      size="xs"
                      variant="success"
                      isDisabled={isSubmitting || !isAllowed}
                      onClick={handleSubmit(handleFormSubmit)}
                    >
                      <SaveIcon />
                    </IconButton>
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
                <IconButton
                  variant="danger"
                  size="xs"
                  onClick={handleFormReset}
                  isDisabled={isSubmitting}
                >
                  <Undo2Icon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>
                {isCreatingOverride ? "Remove Override" : "Undo Changes"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
      {isOverrideFieldFocused && !isDirty && (
        <div
          className={twMerge(
            "absolute top-0 bottom-0 z-10 flex w-8 cursor-pointer items-start justify-center",
            isSingleEnvView ? "-right-4 pt-[8px] pr-[2px]" : "-right-[18px] pt-[8px] pr-[12px]"
          )}
          onMouseEnter={() => setIsHoveringActionZone(true)}
          onMouseLeave={() => setIsHoveringActionZone(false)}
        >
          <EllipsisIcon className="animate-fade-in text-muted-foreground/40 size-4" />
        </div>
      )}
      {!isDirty && (
        <div
          onMouseEnter={() => setIsHoveringActionZone(true)}
          onMouseLeave={() => setIsHoveringActionZone(false)}
          className={twMerge(
            "absolute z-20",
            "flex items-center rounded-md border border-border bg-container-hover px-0.5 py-0.5 shadow-md",
            "pointer-events-none opacity-0 transition-all duration-300",
            "group-hover:pointer-events-auto group-hover:gap-1 group-hover:opacity-100",
            isDeleteDialogOpen && "pointer-events-auto gap-1 opacity-100",
            isOverrideFieldFocused &&
              !showMenuWhileFocused &&
              "group-hover:pointer-events-none group-hover:gap-0 group-hover:opacity-0",
            isOverrideFieldFocused &&
              showMenuWhileFocused &&
              "pointer-events-auto gap-1 opacity-100",
            isSingleEnvView ? "-top-[1.5px] -right-2.5" : "-top-[1.5px] -right-1.5"
          )}
        >
          <Tooltip delayDuration={300} disableHoverableContent>
            <TooltipTrigger>
              <IconButton
                onClick={() => {
                  setFocus("value", { shouldSelect: true });
                }}
                variant="ghost"
                size="xs"
                className={twMerge(
                  "w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7",
                  isDeleteDialogOpen && "w-7"
                )}
              >
                <EditIcon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>Edit Override</TooltipContent>
          </Tooltip>
          {!isCreatingOverride && (
            <Tooltip delayDuration={300} disableHoverableContent>
              <TooltipTrigger>
                <IconButton
                  isDisabled={!canFetchOverrideValue}
                  onClick={handleCopyOverrideToClipboard}
                  variant="ghost"
                  size="xs"
                  className={twMerge(
                    "w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7",
                    isDeleteDialogOpen && "w-7"
                  )}
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
          <Tooltip delayDuration={300} disableHoverableContent>
            <TooltipTrigger>
              <IconButton
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
                  "w-0 overflow-hidden border-0 transition-all duration-300 group-hover:w-7 hover:text-danger",
                  isDeleteDialogOpen && "w-7"
                )}
              >
                <TrashIcon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>
              {isCreatingOverride ? "Cancel Override" : "Remove Override"}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
};
