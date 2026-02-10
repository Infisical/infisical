/* eslint-disable no-nested-ternary */
import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import {
  BellIcon,
  CodeXmlIcon,
  CopyIcon,
  EditIcon,
  EllipsisIcon,
  EyeOffIcon,
  ForwardIcon,
  GitBranchIcon,
  HistoryIcon,
  MessageSquareIcon,
  SaveIcon,
  TagsIcon,
  TrashIcon,
  Undo2Icon,
  UsersIcon,
  WorkflowIcon,
  WrapTextIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretReferenceTree } from "@app/components/secrets/SecretReferenceDetails";
import { DeleteActionModal, Modal, ModalContent } from "@app/components/v2";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import {
  Badge,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableIconButton,
  UnstableSeparator
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp, useToggle } from "@app/hooks";
import { useUpdateSecretV3 } from "@app/hooks/api";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { Reminder } from "@app/hooks/api/reminders/types";
import { ProjectEnv, SecretType, SecretV3RawSanitized, WsTag } from "@app/hooks/api/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";
import { AddShareSecretModal } from "@app/pages/organization/SecretSharingPage/components/ShareSecret/AddShareSecretModal";
import { CollapsibleSecretImports } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/CollapsibleSecretImports";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

import { SecretAccessInsights } from "./SecretAccessInsights";
import { SecretCommentForm } from "./SecretCommentForm";
import { SecretMetadataForm } from "./SecretMetadataForm";
import { SecretReminderForm } from "./SecretReminderForm";
import { SecretTagForm } from "./SecretTagForm";
import { SecretVersionHistory } from "./SecretVersionHistory";

type Props = {
  defaultValue?: string | null;
  secretName: string;
  secretId?: string;
  isOverride?: boolean;
  isCreatable?: boolean;
  isVisible?: boolean;
  isImportedSecret: boolean;
  comment?: string;
  tags?: WsTag[];
  secretMetadata?: { key: string; value: string; isEncrypted?: boolean }[];
  skipMultilineEncoding?: boolean | null;
  reminder?: Reminder;
  environment: string;
  environmentName: string;
  secretValueHidden: boolean;
  secretPath: string;
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
  onAddOverride?: () => void;
  isRotatedSecret?: boolean;
  isEmpty?: boolean;
  importedSecret?:
    | {
        secretPath: string;
        secret?: SecretV3RawSanitized;
        environmentInfo?: ProjectEnv;
        environment: string;
      }
    | undefined;
  importedBy?: {
    environment: { name: string; slug: string };
    folders: {
      name: string;
      secrets?: { secretId: string; referencedSecretKey: string; referencedSecretEnv: string }[];
      isImported: boolean;
    }[];
  }[];
  isSecretPresent?: boolean;
};

export const SecretEditTableRow = ({
  defaultValue,
  isCreatable,
  isOverride,
  isImportedSecret,
  onSecretUpdate,
  secretName,
  secretValueHidden,
  onSecretCreate,
  onSecretDelete,
  onAddOverride,
  environment,
  secretPath,
  isVisible,
  secretId,
  isRotatedSecret,
  importedBy,
  importedSecret,
  isEmpty,
  isSecretPresent,
  comment,
  tags,
  secretMetadata,
  environmentName,
  skipMultilineEncoding,
  reminder
}: Props) => {
  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "editSecret",
    "accessInsightsUpgrade",
    "createSharedSecret"
  ] as const);

  const { currentProject } = useProject();
  const { subscription } = useSubscription();

  const [isFieldFocused, setIsFieldFocused] = useToggle();

  const fetchSharedValueParams =
    importedSecret && !isSecretPresent
      ? {
          environment: importedSecret.environment,
          secretPath: importedSecret.secretPath,
          secretKey: importedSecret.secret?.key ?? "",
          projectId: currentProject.id
        }
      : {
          environment,
          secretPath,
          secretKey: secretName,
          projectId: currentProject.id
        };

  const canFetchSharedValue = Boolean(importedSecret ?? secretId) && !isEmpty && !secretValueHidden;

  const {
    data: sharedValueData,
    isPending: isPendingSharedValue,
    isError: isErrorFetchingSharedValue,
    refetch: refetchSharedValue
  } = useGetSecretValue(fetchSharedValueParams, {
    enabled: canFetchSharedValue && (isVisible || isFieldFocused)
  });

  const isFetchingSharedValue = canFetchSharedValue && isPendingSharedValue;

  const {
    handleSubmit,
    control,
    reset,
    setValue,
    setFocus,
    formState: { isDirty, isSubmitting }
  } = useForm({
    defaultValues: {
      value: isEmpty ? defaultValue || null : (sharedValueData?.value ?? (defaultValue || null))
    }
  });

  useEffect(() => {
    if (sharedValueData && !isDirty && !isEmpty) {
      setValue("value", sharedValueData.value ?? null);
    }
  }, [sharedValueData]);

  const { permission } = useProjectPermission();
  const { mutateAsync: updateSecretV3, isPending: isUpdatingMultiline } = useUpdateSecretV3();

  const [isDeleting, setIsDeleting] = useToggle();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isCommentOpen, setIsCommentOpen] = useState(false);
  const [isTagOpen, setIsTagOpen] = useState(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isAccessInsightsOpen, setIsAccessInsightsOpen] = useState(false);
  const [isSecretReferenceOpen, setIsSecretReferenceOpen] = useState(false);

  const toggleModal = useCallback(() => {
    setIsModalOpen((prev) => !prev);
  }, []);

  const handleFormReset = () => {
    reset({ value: sharedValueData?.value ?? (defaultValue || null) });
  };

  const handleCopySharedToClipboard = async () => {
    try {
      const { data } = await refetchSharedValue();
      await window.navigator.clipboard.writeText(data?.value ?? "");
      createNotification({ type: "success", text: "Copied secret to clipboard" });
    } catch (e) {
      console.error(e);
      createNotification({
        type: "error",
        text: "Failed to fetch secret value."
      });
    }
  };

  const handleToggleMultilineEncoding = async () => {
    try {
      const result = await updateSecretV3({
        environment,
        projectId: currentProject.id,
        secretPath,
        secretKey: secretName,
        type: SecretType.Shared,
        skipMultilineEncoding: !skipMultilineEncoding
      });

      if ("approval" in result) {
        createNotification({
          type: "info",
          text: "Requested change has been sent for review"
        });
      } else {
        createNotification({
          type: "success",
          text: `Multi-line encoding ${skipMultilineEncoding ? "disabled" : "enabled"}`
        });
      }
    } catch (e) {
      console.error(e);
      createNotification({
        type: "error",
        text: "Failed to update multi-line encoding setting."
      });
    }
  };

  const handleFormSubmit = async ({ value }: { value?: string | null }) => {
    if ((value || value === "") && secretName) {
      if (isCreatable) {
        await onSecretCreate(environment, secretName, value);
      } else {
        if (
          importedBy &&
          importedBy.some(({ folders }) =>
            folders?.some(({ secrets }) =>
              secrets?.some(
                ({ referencedSecretKey, referencedSecretEnv }) =>
                  referencedSecretKey === secretName && referencedSecretEnv === environment
              )
            )
          )
        ) {
          handlePopUpOpen("editSecret", { secretValue: value });
          return;
        }
        await onSecretUpdate(
          environment,
          secretName,
          value,
          secretValueHidden,
          SecretType.Shared,
          secretId
        );
      }
    }
    if (secretValueHidden) {
      setTimeout(() => {
        reset({ value: defaultValue || null });
      }, 50);
    } else {
      reset({ value });
    }
  };

  const handleEditSecret = async ({ secretValue }: { secretValue: string }) => {
    await onSecretUpdate(
      environment,
      secretName,
      secretValue,
      secretValueHidden,
      SecretType.Shared,
      secretId
    );
    reset({ value: secretValue });
    handlePopUpClose("editSecret");
  };

  const canReadSecretValue = hasSecretReadValueOrDescribePermission(
    permission,
    ProjectPermissionSecretActions.ReadValue
  );

  const canEditSecretValue = permission.can(
    ProjectPermissionSecretActions.Edit,
    subject(ProjectPermissionSub.Secrets, {
      environment,
      secretPath,
      secretName,
      secretTags: ["*"]
    })
  );

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

  const canReadTags = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  const canCreate = permission.can(
    ProjectPermissionSecretActions.Create,
    subject(ProjectPermissionSub.Secrets, {
      environment,
      secretPath,
      secretName,
      secretTags: ["*"]
    })
  );

  const isReadOnly =
    isImportedSecret ||
    isRotatedSecret ||
    isFetchingSharedValue ||
    isErrorFetchingSharedValue ||
    (isCreatable ? !canCreate : !canEditSecretValue);

  const shouldStayExpanded =
    isCommentOpen || isTagOpen || isMetadataOpen || isReminderOpen || isDropdownOpen;

  return (
    <div className="flex w-full flex-col gap-y-2 py-1.5">
      <DeleteActionModal
        isOpen={isModalOpen}
        onClose={toggleModal}
        title="Do you want to delete the selected secret?"
        deleteKey={secretName}
        onDeleteApproved={handleDeleteSecret}
      />

      <div className="flex w-full cursor-text items-center space-x-2">
        {secretValueHidden && (
          <Tooltip>
            <TooltipTrigger asChild>
              <EyeOffIcon className="size-4 text-secret" />
            </TooltipTrigger>
            <TooltipContent>
              You do not have access to view the current value
              {canEditSecretValue && !isRotatedSecret ? ", but you can set a new one" : "."}
            </TooltipContent>
          </Tooltip>
        )}
        <div className="grow pr-2 pl-1">
          <Controller
            control={control}
            name="value"
            render={({ field }) => (
              <InfisicalSecretInput
                {...field}
                isReadOnly={isReadOnly}
                value={
                  secretValueHidden || isFetchingSharedValue
                    ? HIDDEN_SECRET_VALUE
                    : isErrorFetchingSharedValue
                      ? "Error fetching secret value..."
                      : (field.value as string)
                }
                key="secret-input-shared"
                isVisible={isVisible && !secretValueHidden}
                secretPath={secretPath}
                environment={environment}
                isImport={isImportedSecret}
                defaultValue={secretValueHidden ? "" : undefined}
                canEditButNotView={secretValueHidden}
                onFocus={() => setIsFieldFocused.on()}
                onBlur={() => {
                  field.onBlur();
                  setIsFieldFocused.off();
                }}
              />
            )}
          />
        </div>
        <div className="flex w-fit items-start justify-end space-x-2 self-start pl-2 transition-all">
          {isDirty && !isImportedSecret ? (
            <>
              <ProjectPermissionCan
                I={isCreatable ? ProjectPermissionActions.Create : ProjectPermissionActions.Edit}
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
                      <TooltipContent>Save changes</TooltipContent>
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
                  <TooltipContent>Undo changes</TooltipContent>
                </Tooltip>
              </div>
            </>
          ) : (
            <div
              className={twMerge(
                "flex items-center transition-all duration-500 group-hover:space-x-1.5",
                shouldStayExpanded && "space-x-1.5"
              )}
            >
              <Tooltip delayDuration={300} disableHoverableContent>
                <TooltipTrigger>
                  <UnstableIconButton
                    isDisabled={
                      isImportedSecret ||
                      isRotatedSecret ||
                      (isCreatable ? !canCreate : !canEditSecretValue)
                    }
                    onClick={() => {
                      setFocus("value", { shouldSelect: true });
                    }}
                    variant="ghost"
                    size="xs"
                    className={twMerge(
                      "w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100",
                      shouldStayExpanded && "w-7 opacity-100"
                    )}
                  >
                    <EditIcon />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>
                  {isImportedSecret
                    ? "Cannot Edit Imported Secret"
                    : isRotatedSecret
                      ? "Cannot Edit Rotated Secret"
                      : (isCreatable ? !canCreate : !canEditSecretValue)
                        ? "Access Denied"
                        : `${isCreatable ? "Add" : "Edit"} Value`}
                </TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={300} disableHoverableContent>
                <TooltipTrigger>
                  <UnstableIconButton
                    isDisabled={!canFetchSharedValue}
                    onClick={handleCopySharedToClipboard}
                    variant="ghost"
                    size="xs"
                    className={twMerge(
                      "w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100",
                      shouldStayExpanded && "w-7 opacity-100"
                    )}
                  >
                    <CopyIcon />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>
                  {canFetchSharedValue
                    ? "Copy Secret"
                    : canReadSecretValue
                      ? "No Secret Value"
                      : "Access Denied"}
                </TooltipContent>
              </Tooltip>
              <Popover open={isCommentOpen} onOpenChange={setIsCommentOpen}>
                <Tooltip delayDuration={300} disableHoverableContent>
                  <TooltipTrigger>
                    <PopoverTrigger asChild>
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        isDisabled={isCreatable || isImportedSecret}
                        className={twMerge(
                          comment && !isImportedSecret
                            ? "w-7 text-project opacity-100"
                            : "w-0 opacity-0",
                          "overflow-hidden border-0 group-hover:w-7 group-hover:opacity-100",
                          shouldStayExpanded && "w-7 opacity-100"
                        )}
                      >
                        <MessageSquareIcon />
                      </UnstableIconButton>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isImportedSecret
                      ? "Cannot Add Comment to Imported Secret"
                      : isCreatable
                        ? "Create Secret to Add Comment"
                        : `${comment ? "View" : "Add"} Comment`}
                  </TooltipContent>
                </Tooltip>
                <PopoverContent
                  onCloseAutoFocus={(e) => e.preventDefault()}
                  className="w-80"
                  align="end"
                >
                  <SecretCommentForm
                    comment={comment}
                    secretKey={secretName}
                    secretPath={secretPath}
                    environment={environment}
                    onClose={() => setIsCommentOpen(false)}
                  />
                </PopoverContent>
              </Popover>
              <Popover modal open={isTagOpen} onOpenChange={setIsTagOpen}>
                <Tooltip delayDuration={300} disableHoverableContent>
                  <TooltipTrigger>
                    <PopoverTrigger asChild>
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        isDisabled={isCreatable || isImportedSecret || !canReadTags}
                        className={twMerge(
                          canReadTags && tags?.length && !isImportedSecret
                            ? "w-7 text-project opacity-100"
                            : "w-0 opacity-0",
                          "overflow-hidden border-0 group-hover:w-7 group-hover:opacity-100",
                          shouldStayExpanded && "w-7 opacity-100"
                        )}
                      >
                        <TagsIcon />
                      </UnstableIconButton>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    {!canReadTags
                      ? "Access Denied"
                      : isImportedSecret
                        ? "Cannot Add Tags to Imported Secret"
                        : isCreatable
                          ? "Create Secret to Add Tags"
                          : `${tags?.length ? "View" : "Add"} Tags`}
                  </TooltipContent>
                </Tooltip>
                <PopoverContent
                  onCloseAutoFocus={(e) => e.preventDefault()}
                  className="w-80"
                  align="end"
                >
                  <SecretTagForm
                    secretKey={secretName}
                    secretPath={secretPath}
                    environment={environment}
                    tags={tags}
                    onClose={() => setIsTagOpen(false)}
                  />
                </PopoverContent>
              </Popover>
              <Popover open={isReminderOpen} onOpenChange={setIsReminderOpen}>
                <Tooltip delayDuration={300} disableHoverableContent>
                  <TooltipTrigger>
                    <PopoverTrigger asChild>
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        isDisabled={isCreatable || isImportedSecret || !secretId}
                        className={twMerge(
                          reminder && !isImportedSecret
                            ? "w-7 text-project opacity-100"
                            : "w-0 opacity-0",
                          "overflow-hidden border-0 group-hover:w-7 group-hover:opacity-100",
                          shouldStayExpanded && "w-7 opacity-100"
                        )}
                      >
                        <BellIcon />
                      </UnstableIconButton>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isImportedSecret
                      ? "Cannot Set Reminder on Imported Secret"
                      : isCreatable
                        ? "Create Secret to Add Reminder"
                        : `${reminder ? "View" : "Add"} Reminder`}
                  </TooltipContent>
                </Tooltip>
                <PopoverContent
                  onCloseAutoFocus={(e) => e.preventDefault()}
                  className="w-[420px]"
                  side="left"
                >
                  {secretId && (
                    <SecretReminderForm
                      secretId={secretId}
                      secretKey={secretName}
                      secretPath={secretPath}
                      environment={environment}
                      reminder={reminder}
                      onClose={() => setIsReminderOpen(false)}
                    />
                  )}
                </PopoverContent>
              </Popover>
              <Popover open={isMetadataOpen} onOpenChange={setIsMetadataOpen}>
                <Tooltip delayDuration={300} disableHoverableContent>
                  <TooltipTrigger>
                    <PopoverTrigger asChild>
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        isDisabled={isCreatable || isImportedSecret}
                        className={twMerge(
                          secretMetadata?.length && !isImportedSecret
                            ? "w-7 text-project opacity-100"
                            : "w-0 opacity-0",
                          "overflow-hidden border-0 group-hover:w-7 group-hover:opacity-100",
                          shouldStayExpanded && "w-7 opacity-100"
                        )}
                      >
                        <CodeXmlIcon />
                      </UnstableIconButton>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isImportedSecret
                      ? "Cannot Edit Metadata on Imported Secret"
                      : isCreatable
                        ? "Create Secret to Add Metadata"
                        : `${secretMetadata?.length ? "View" : "Add"} Metadata`}
                  </TooltipContent>
                </Tooltip>
                <PopoverContent
                  onCloseAutoFocus={(e) => e.preventDefault()}
                  className="w-[500px]"
                  align="end"
                >
                  <SecretMetadataForm
                    secretMetadata={secretMetadata}
                    secretKey={secretName}
                    secretPath={secretPath}
                    environment={environment}
                    onClose={() => setIsMetadataOpen(false)}
                  />
                </PopoverContent>
              </Popover>
              <Tooltip delayDuration={300} disableHoverableContent>
                <TooltipTrigger>
                  <UnstableIconButton
                    variant="ghost"
                    size="xs"
                    isDisabled={
                      isCreatable || isImportedSecret || !canEditSecretValue || isUpdatingMultiline
                    }
                    onClick={handleToggleMultilineEncoding}
                    className={twMerge(
                      skipMultilineEncoding && !isImportedSecret
                        ? "w-7 text-project opacity-100"
                        : "w-0 opacity-0",
                      "overflow-hidden border-0 group-hover:w-7 group-hover:opacity-100",
                      shouldStayExpanded && "w-7 opacity-100"
                    )}
                  >
                    <WrapTextIcon />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>
                  {isImportedSecret
                    ? "Cannot Edit Multi-line Encoding on Imported Secret"
                    : isCreatable
                      ? "Create Secret to Edit Multi-line Encoding"
                      : !canEditSecretValue
                        ? "Access Denied"
                        : skipMultilineEncoding
                          ? "Disable Multi-line Encoding"
                          : "Enable Multi-line Encoding"}
                </TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={300} disableHoverableContent>
                <TooltipTrigger>
                  <UnstableIconButton
                    isDisabled={
                      secretValueHidden ||
                      !currentProject.secretSharing ||
                      (isCreatable && !isImportedSecret)
                    }
                    onClick={async () => {
                      if (sharedValueData) {
                        handlePopUpOpen("createSharedSecret", {
                          value: sharedValueData.value
                        });
                        return;
                      }
                      const { data } = await refetchSharedValue();
                      if (data) {
                        handlePopUpOpen("createSharedSecret", { value: data.value });
                      }
                    }}
                    variant="ghost"
                    size="xs"
                    className={twMerge(
                      "w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100",
                      shouldStayExpanded && "w-7 opacity-100"
                    )}
                  >
                    <ForwardIcon />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>
                  {!currentProject.secretSharing
                    ? "Secret Sharing Disabled"
                    : secretValueHidden
                      ? "Access Denied"
                      : isCreatable && !importedSecret
                        ? "Create Secret to Share"
                        : "Share Secret"}
                </TooltipContent>
              </Tooltip>
              <UnstableDropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                <UnstableDropdownMenuTrigger asChild>
                  <UnstableIconButton
                    variant="ghost"
                    size="xs"
                    className={twMerge(
                      "w-0 overflow-hidden border-0 opacity-0 group-hover:w-7 group-hover:opacity-100",
                      shouldStayExpanded && "w-7 opacity-100"
                    )}
                  >
                    <EllipsisIcon />
                  </UnstableIconButton>
                </UnstableDropdownMenuTrigger>
                <UnstableDropdownMenuContent align="end">
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Create}
                    a={subject(ProjectPermissionSub.Secrets, {
                      environment,
                      secretPath,
                      secretName,
                      secretTags: ["*"]
                    })}
                  >
                    {(isAllowed) => (
                      <Tooltip
                        open={
                          isCreatable || isImportedSecret || isOverride || !isAllowed
                            ? undefined
                            : false
                        }
                        delayDuration={300}
                        disableHoverableContent
                      >
                        <TooltipTrigger className="block w-full">
                          <UnstableDropdownMenuItem
                            onClick={() => onAddOverride?.()}
                            isDisabled={isCreatable || isImportedSecret || isOverride || !isAllowed}
                          >
                            <GitBranchIcon />
                            Add Override
                          </UnstableDropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          {!isAllowed
                            ? "Access Denied"
                            : isOverride
                              ? "Override Already Exists"
                              : isImportedSecret
                                ? "Cannot Override Imported Secret"
                                : isCreatable
                                  ? "Create Secret First"
                                  : "Add Personal Override"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </ProjectPermissionCan>
                  <Tooltip
                    open={!canReadSecretValue || !secretId || isEmpty ? undefined : false}
                    delayDuration={300}
                    disableHoverableContent
                  >
                    <TooltipTrigger className="block w-full">
                      <UnstableDropdownMenuItem
                        onClick={() => setIsSecretReferenceOpen(true)}
                        isDisabled={!canReadSecretValue || !secretId || isEmpty}
                      >
                        <WorkflowIcon />
                        Secret References
                      </UnstableDropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {!canReadSecretValue
                        ? "Access Denied"
                        : !secretId || isEmpty
                          ? "Create Secret to View References"
                          : "View Secret References"}
                    </TooltipContent>
                  </Tooltip>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Read}
                    a={ProjectPermissionSub.Commits}
                  >
                    {(isAllowed) => (
                      <Tooltip
                        open={isImportedSecret || isCreatable || !isAllowed ? undefined : false}
                        delayDuration={300}
                        disableHoverableContent
                      >
                        <TooltipTrigger className="block w-full">
                          <UnstableDropdownMenuItem
                            onClick={() => setIsVersionHistoryOpen(true)}
                            isDisabled={!secretId || isCreatable || isImportedSecret || !isAllowed}
                          >
                            <HistoryIcon />
                            Version History
                          </UnstableDropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          {!isAllowed
                            ? "Access Denied"
                            : isImportedSecret
                              ? "Cannot View Version History for Imported Secret"
                              : "Create Secret to View History"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </ProjectPermissionCan>
                  <Tooltip
                    open={isImportedSecret || isCreatable ? undefined : false}
                    delayDuration={300}
                    disableHoverableContent
                  >
                    <TooltipTrigger className="block w-full">
                      <UnstableDropdownMenuItem
                        onClick={() => {
                          if (!subscription?.secretAccessInsights) {
                            handlePopUpOpen("accessInsightsUpgrade");
                          } else {
                            setIsAccessInsightsOpen(true);
                          }
                        }}
                        isDisabled={!secretId || isCreatable || isImportedSecret}
                      >
                        <UsersIcon />
                        Access Insights
                      </UnstableDropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {isImportedSecret
                        ? "Cannot View Access for Imported Secret"
                        : "Create Secret to View Access"}
                    </TooltipContent>
                  </Tooltip>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Delete}
                    a={subject(ProjectPermissionSub.Secrets, {
                      environment,
                      secretPath,
                      secretName,
                      secretTags: ["*"]
                    })}
                  >
                    {(isAllowed) => (
                      <Tooltip
                        open={
                          isRotatedSecret || isImportedSecret || isCreatable ? undefined : false
                        }
                        delayDuration={300}
                        disableHoverableContent
                      >
                        <TooltipTrigger className="block w-full">
                          <UnstableDropdownMenuItem
                            onClick={toggleModal}
                            isDisabled={
                              isCreatable ||
                              isDeleting ||
                              !isAllowed ||
                              isRotatedSecret ||
                              isImportedSecret
                            }
                            variant="danger"
                          >
                            <TrashIcon />
                            Delete Secret
                          </UnstableDropdownMenuItem>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          {isRotatedSecret
                            ? "Cannot Delete Rotated Secret"
                            : isImportedSecret
                              ? "Cannot Delete Imported Secret"
                              : isCreatable
                                ? "No Secret to Delete"
                                : "Delete"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </ProjectPermissionCan>
                </UnstableDropdownMenuContent>
              </UnstableDropdownMenu>
              <Modal isOpen={isSecretReferenceOpen} onOpenChange={setIsSecretReferenceOpen}>
                <ModalContent
                  title="Secret Reference Details"
                  subTitle="Visual breakdown of secrets referenced by this secret."
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <SecretReferenceTree
                    secretPath={secretPath}
                    environment={environment}
                    secretKey={secretName}
                  />
                </ModalContent>
              </Modal>
              <Sheet open={isVersionHistoryOpen} onOpenChange={setIsVersionHistoryOpen}>
                <SheetContent
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  className="gap-y-0"
                  side="right"
                >
                  <SheetHeader>
                    <SheetTitle>Version History</SheetTitle>
                    <SheetDescription>Audit secret history and rollback changes</SheetDescription>
                  </SheetHeader>
                  <UnstableSeparator />
                  <div className="bg-container p-4 text-foreground">
                    <p className="truncate">{secretName}</p>
                    <Badge variant="neutral" className="mt-0.5">
                      {environmentName}
                    </Badge>
                  </div>
                  <UnstableSeparator />
                  {secretId && (
                    <SecretVersionHistory
                      secretId={secretId}
                      secretKey={secretName}
                      environment={environment}
                      secretPath={secretPath}
                      isRotatedSecret={isRotatedSecret ?? false}
                      canReadValue={canReadSecretValue}
                    />
                  )}
                </SheetContent>
              </Sheet>
              <Sheet open={isAccessInsightsOpen} onOpenChange={setIsAccessInsightsOpen}>
                <SheetContent
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  className="gap-y-0"
                  side="right"
                >
                  <SheetHeader>
                    <SheetTitle>Access Insights</SheetTitle>
                    <SheetDescription>
                      View users, groups, and identities with access to this secret
                    </SheetDescription>
                  </SheetHeader>
                  <UnstableSeparator />
                  <div className="bg-container p-4 text-foreground">
                    <p className="truncate">{secretName}</p>
                    <Badge variant="neutral" className="mt-0.5">
                      {environmentName}
                    </Badge>
                  </div>
                  <UnstableSeparator />
                  {secretId && (
                    <SecretAccessInsights
                      secretKey={secretName}
                      environment={environment}
                      secretPath={secretPath}
                    />
                  )}
                </SheetContent>
              </Sheet>
              <UpgradePlanModal
                isOpen={popUp.accessInsightsUpgrade.isOpen}
                onOpenChange={(isOpen) => handlePopUpToggle("accessInsightsUpgrade", isOpen)}
                text="Secret access insights can be unlocked if you upgrade to Infisical Pro plan."
              />
            </div>
          )}
        </div>
      </div>

      <DeleteActionModal
        isOpen={popUp.editSecret.isOpen}
        deleteKey="confirm"
        buttonColorSchema="secondary"
        buttonText="Save"
        subTitle=""
        title="Do you want to edit this secret?"
        onChange={(isOpen) => handlePopUpToggle("editSecret", isOpen)}
        onDeleteApproved={() => handleEditSecret(popUp?.editSecret?.data)}
        formContent={
          importedBy &&
          importedBy.length > 0 && (
            <CollapsibleSecretImports
              importedBy={importedBy}
              secretsToDelete={[secretName]}
              onlyReferences
            />
          )
        }
      />
      <AddShareSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </div>
  );
};
