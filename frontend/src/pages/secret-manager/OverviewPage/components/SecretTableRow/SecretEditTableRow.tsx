/* eslint-disable no-nested-ternary */
import { useCallback, useEffect, useRef, useState } from "react";
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
import { DeleteActionModal, Input, Modal, ModalContent } from "@app/components/v2";
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
  UnstableSeparator,
  UnstableTableCell
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

import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { useBatchStoreApi } from "@app/pages/secret-manager/SecretDashboardPage/SecretMainPage.store";

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
  }) => Promise<void>;
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
  isSingleEnvView?: boolean;
  onSecretRename?: (newName: string) => Promise<void>;
  isBatchMode?: boolean;
  isPendingCreate?: boolean;
  isPendingDelete?: boolean;
  onBatchRevert?: (env: string, key: string) => void;
  hasPendingChange?: boolean;
  hasPendingValueChange?: boolean;
  pendingKeyName?: string;
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
  reminder,
  isSingleEnvView,
  isBatchMode,
  isPendingCreate,
  isPendingDelete,
  onBatchRevert,
  hasPendingChange,
  hasPendingValueChange,
  pendingKeyName
}: Props) => {
  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "editSecret",
    "accessInsightsUpgrade",
    "createSharedSecret"
  ] as const);

  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const batchStore = useBatchStoreApi();

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

  const canFetchSharedValue =
    Boolean(importedSecret ?? secretId) && !isEmpty && !secretValueHidden && !isPendingCreate;

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
    getFieldState,
    watch,
    formState: { isDirty, isSubmitting }
  } = useForm({
    defaultValues: {
      // In batch mode with a pending value change, use defaultValue (from merged data which
      // includes the pending value) instead of sharedValueData (cached original API value).
      value: isEmpty
        ? defaultValue || null
        : isBatchMode && hasPendingValueChange
          ? defaultValue || null
          : (sharedValueData?.value ?? (defaultValue || null)),
      ...(isSingleEnvView
        ? {
            key: isBatchMode && hasPendingChange && pendingKeyName ? pendingKeyName : secretName,
            comment: comment ?? "",
            tags: tags?.map((t) => ({ id: t.id, slug: t.slug })) ?? [],
            metadata:
              secretMetadata?.map((m) => ({
                key: m.key,
                value: m.value,
                isEncrypted: m.isEncrypted ?? false
              })) ?? []
          }
        : {})
    }
  });

  // Track the true original value for batch mode revert detection.
  // Unlike form defaultValues, this doesn't shift when reset() is called.
  // When there's a pending value change, use the cached API value as the original (not the pending value).
  const originalValueRef = useRef<string | null>(
    isEmpty
      ? defaultValue || null
      : isBatchMode && hasPendingValueChange
        ? (sharedValueData?.value ?? null)
        : (sharedValueData?.value ?? (defaultValue || null))
  );

  useEffect(() => {
    if (sharedValueData && !getFieldState("value").isDirty && !isEmpty) {
      // In batch mode with a pending value change, don't overwrite the form value
      // (which was initialized from merged data) with the original API value.
      // Only update originalValueRef so revert detection works correctly.
      // Key-only pending changes should still allow the lazy-loaded value to be set.
      if (isBatchMode && hasPendingValueChange) {
        originalValueRef.current = sharedValueData.value ?? null;
        return;
      }
      setValue("value", sharedValueData.value ?? null);
      originalValueRef.current = sharedValueData.value ?? null;
    }
  }, [sharedValueData]);

  // Keep original refs for comment/tags/metadata in sync with server data.
  // Without this, after a batch commit clears pending changes, the form reset
  // (line ~514) would revert to stale values from initial mount instead of
  // the freshly committed server data.
  useEffect(() => {
    if (!isSingleEnvView || hasPendingChange) return;

    originalCommentRef.current = comment ?? "";
    originalTagsRef.current = tags?.map((t) => ({ id: t.id, slug: t.slug })) ?? [];
    originalMetadataRef.current =
      secretMetadata?.map((m) => ({
        key: m.key,
        value: m.value,
        isEncrypted: m.isEncrypted ?? false
      })) ?? [];
  }, [comment, tags, secretMetadata, isSingleEnvView, hasPendingChange]);

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

  const originalCommentRef = useRef(comment ?? "");
  const originalTagsRef = useRef(tags?.map((t) => ({ id: t.id, slug: t.slug })) ?? []);
  const originalMetadataRef = useRef(
    secretMetadata?.map((m) => ({
      key: m.key,
      value: m.value,
      isEncrypted: m.isEncrypted ?? false
    })) ?? []
  );

  // Stable callbacks for child components to avoid resetting their debounce timers on re-render
  const handleCommentChange = useCallback(
    (newComment: string) => setValue("comment", newComment),
    [setValue]
  );
  const handleTagsChange = useCallback(
    (newTags: { id: string; slug: string }[]) =>
      setValue(
        "tags",
        newTags.map((t) => ({ id: t.id, slug: t.slug }))
      ),
    [setValue]
  );
  const handleMetadataChange = useCallback(
    (newMetadata: { key: string; value: string; isEncrypted?: boolean }[]) =>
      setValue(
        "metadata",
        newMetadata.map((m) => ({
          key: m.key,
          value: m.value,
          isEncrypted: m.isEncrypted ?? false
        }))
      ),
    [setValue]
  );

  const handleFormReset = () => {
    reset({
      value: sharedValueData?.value ?? (defaultValue || null),
      ...(isSingleEnvView
        ? {
            key: secretName,
            comment: originalCommentRef.current,
            tags: originalTagsRef.current,
            metadata: originalMetadataRef.current
          }
        : {})
    });
  };

  // Debounced auto-apply for batch mode: watch form values and apply after 500ms
  const watchedValue = watch("value");
  const watchedKey = watch("key");
  const watchedComment = watch("comment");
  const watchedTags = watch("tags") as { id: string; slug: string }[] | undefined;
  const watchedMetadata = watch("metadata") as
    | { key: string; value: string; isEncrypted: boolean }[]
    | undefined;
  // Serialize metadata for effect dependency since watch() returns same array ref for nested changes
  const serializedMetadata = JSON.stringify(watchedMetadata);
  const batchAutoApplyTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastAppliedRef = useRef<{
    value: unknown;
    key: unknown;
    comment: unknown;
    tags: unknown;
    metadata: unknown;
  }>({
    value: undefined,
    key: undefined,
    comment: undefined,
    tags: undefined,
    metadata: undefined
  });

  const areTagsEqual = (a: { id: string; slug: string }[], b: { id: string; slug: string }[]) => {
    if (a.length !== b.length) return false;
    const aIds = a.map((t) => t.id).sort();
    const bIds = b.map((t) => t.id).sort();
    return aIds.every((id, i) => id === bIds[i]);
  };

  const areMetadataEqual = (
    a: { key: string; value: string; isEncrypted?: boolean }[],
    b: { key: string; value: string; isEncrypted?: boolean }[]
  ) => {
    if (a.length !== b.length) return false;
    return a.every(
      (m, i) =>
        m.key === b[i].key &&
        m.value === b[i].value &&
        (m.isEncrypted ?? false) === (b[i].isEncrypted ?? false)
    );
  };

  useEffect(() => {
    if (batchAutoApplyTimer.current) {
      clearTimeout(batchAutoApplyTimer.current);
    }

    if (!isBatchMode) return () => {};

    batchAutoApplyTimer.current = setTimeout(() => {
      // Skip if values haven't changed since last apply
      // Use deep comparison for tags since reset() creates new array references
      if (
        lastAppliedRef.current.value === watchedValue &&
        lastAppliedRef.current.key === watchedKey &&
        lastAppliedRef.current.comment === watchedComment &&
        (lastAppliedRef.current.tags === watchedTags ||
          (Array.isArray(lastAppliedRef.current.tags) &&
            Array.isArray(watchedTags) &&
            areTagsEqual(
              lastAppliedRef.current.tags as { id: string; slug: string }[],
              watchedTags
            ))) &&
        (lastAppliedRef.current.metadata === watchedMetadata ||
          (Array.isArray(lastAppliedRef.current.metadata) &&
            Array.isArray(watchedMetadata) &&
            areMetadataEqual(
              lastAppliedRef.current.metadata as {
                key: string;
                value: string;
                isEncrypted?: boolean;
              }[],
              watchedMetadata
            )))
      ) {
        return;
      }

      // Compare against true originals, not form defaults (which shift after reset)
      const isValueChanged =
        watchedValue !== originalValueRef.current &&
        watchedValue !== null &&
        watchedValue !== undefined;
      const isKeyDirty = isSingleEnvView && watchedKey && watchedKey !== secretName;
      const isCommentDirty =
        isSingleEnvView &&
        watchedComment !== undefined &&
        watchedComment !== originalCommentRef.current;
      const isTagsDirty =
        isSingleEnvView &&
        watchedTags !== undefined &&
        !areTagsEqual(watchedTags, originalTagsRef.current);
      const isMetadataDirty =
        isSingleEnvView &&
        watchedMetadata !== undefined &&
        !areMetadataEqual(watchedMetadata, originalMetadataRef.current);

      // If nothing changed from original, remove pending change directly
      if (!isValueChanged && !isKeyDirty && !isCommentDirty && !isTagsDirty && !isMetadataDirty) {
        if (lastAppliedRef.current.value !== undefined) {
          onBatchRevert?.(environment, secretName);
          lastAppliedRef.current = {
            value: undefined,
            key: undefined,
            comment: undefined,
            tags: undefined,
            metadata: undefined
          };
        }
        return;
      }

      // Check for key rename conflicts before applying (read store snapshot, no subscription)
      let effectiveKeyDirty = isKeyDirty;
      if (isKeyDirty) {
        const { existingSecretKeys, pendingChanges: pc } = batchStore.getState();
        const newKey = watchedKey as string;
        const isTaken =
          existingSecretKeys.has(newKey) ||
          pc.secrets.some(
            (s) =>
              s.id !== secretId &&
              (s.secretKey === newKey ||
                (s.type === PendingAction.Update && s.newSecretName === newKey))
          );
        if (isTaken) {
          createNotification({
            type: "error",
            text: "A secret with this name already exists"
          });
          effectiveKeyDirty = false;
        }
      }

      // If only the key was dirty and it conflicted, reset key back and bail
      if (
        !isValueChanged &&
        !effectiveKeyDirty &&
        !isCommentDirty &&
        !isTagsDirty &&
        !isMetadataDirty
      ) {
        if (isKeyDirty) {
          // Key conflicted — reset form key back to original so the input updates.
          // Update lastAppliedRef first so the effect doesn't re-trigger on the reset.
          lastAppliedRef.current = {
            value: watchedValue,
            key: secretName,
            comment: watchedComment,
            tags: watchedTags,
            metadata: watchedMetadata
          };
          reset({
            value: watchedValue,
            ...(isSingleEnvView
              ? {
                  key: secretName,
                  comment: watchedComment ?? "",
                  tags: watchedTags ?? [],
                  metadata: watchedMetadata ?? []
                }
              : {})
          });
        }
        return;
      }

      lastAppliedRef.current = {
        value: watchedValue,
        key: effectiveKeyDirty ? watchedKey : secretName,
        comment: watchedComment,
        tags: watchedTags,
        metadata: watchedMetadata
      };

      if (isCreatable) {
        if (isValueChanged && (watchedValue || watchedValue === "")) {
          onSecretCreate(environment, secretName, watchedValue as string);
        }
      } else {
        onSecretUpdate({
          env: environment,
          key: secretName,
          value: isValueChanged ? ((watchedValue as string) ?? undefined) : undefined,
          secretValueHidden,
          type: SecretType.Shared,
          secretId,
          newSecretName: effectiveKeyDirty ? (watchedKey as string) : undefined,
          secretComment: isCommentDirty ? (watchedComment as string) : undefined,
          tags: isTagsDirty ? watchedTags : undefined,
          secretMetadata: isMetadataDirty ? watchedMetadata : undefined
        });
      }

      // Reset form to mark as clean (like SecretDashboardPage's auto-save)
      const resetKey = effectiveKeyDirty ? watchedKey || secretName : secretName;
      reset({
        value: watchedValue,
        ...(isSingleEnvView
          ? {
              key: resetKey,
              comment: watchedComment ?? "",
              tags: watchedTags ?? [],
              metadata: watchedMetadata ?? []
            }
          : {})
      });
    }, 500);

    return () => {
      if (batchAutoApplyTimer.current) {
        clearTimeout(batchAutoApplyTimer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBatchMode, watchedValue, watchedKey, watchedComment, watchedTags, serializedMetadata]);

  // Reset form when a pending change is externally discarded (e.g. CommitForm discard button
  // or toggling batch mode off). We don't gate on isBatchMode because React batches the
  // state updates, so isBatchMode can already be false by the time hasPendingChange flips.
  const prevHasPendingRef = useRef(hasPendingChange);
  useEffect(() => {
    if (prevHasPendingRef.current && !hasPendingChange) {
      reset({
        value: originalValueRef.current,
        ...(isSingleEnvView
          ? {
              key: secretName,
              comment: originalCommentRef.current,
              tags: originalTagsRef.current,
              metadata: originalMetadataRef.current
            }
          : {})
      });
      lastAppliedRef.current = {
        value: undefined,
        key: undefined,
        comment: undefined,
        tags: undefined,
        metadata: undefined
      };
    }
    prevHasPendingRef.current = hasPendingChange;
  }, [hasPendingChange, reset, isSingleEnvView, secretName]);

  const handleCopySharedToClipboard = async () => {
    try {
      if (isPendingCreate) {
        await window.navigator.clipboard.writeText((watchedValue as string) ?? "");
      } else {
        const { data } = await refetchSharedValue();
        await window.navigator.clipboard.writeText(data?.value ?? "");
      }
      createNotification({ type: "success", text: "Copied secret to clipboard" });
    } catch (e) {
      console.error(e);
      createNotification({
        type: "error",
        text: "Failed to fetch secret value."
      });
    }
  };

  const canCopySecret = isPendingCreate || canFetchSharedValue;

  const handleToggleMultilineEncoding = async () => {
    if (isBatchMode) {
      onSecretUpdate({
        env: environment,
        key: secretName,
        value: undefined,
        secretValueHidden,
        type: SecretType.Shared,
        secretId,
        skipMultilineEncoding: !skipMultilineEncoding
      });
      return;
    }

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

  const handleFormSubmit = async ({ value, key }: { value?: string | null; key?: string }) => {
    const isValueDirty = getFieldState("value").isDirty;
    const isKeyDirty = isSingleEnvView && key && key !== secretName;

    // If the value edit requires confirmation (importedBy references), defer everything
    // (including rename) to handleEditSecret so the rename isn't lost on re-render.
    if (
      isValueDirty &&
      (value || value === "") &&
      !isCreatable &&
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
      handlePopUpOpen("editSecret", { secretValue: value, newKey: isKeyDirty ? key : undefined });
      return;
    }

    // Handle rename and/or value changes in a single mutation
    if ((isKeyDirty || isValueDirty) && secretName) {
      if (isCreatable) {
        if (isValueDirty && (value || value === "")) {
          await onSecretCreate(environment, secretName, value);
        }
      } else {
        await onSecretUpdate({
          env: environment,
          key: secretName,
          value: value ?? undefined,
          secretValueHidden,
          type: SecretType.Shared,
          secretId,
          newSecretName: isKeyDirty ? key : undefined
        });
      }
    }
    // Update originalValueRef so batch mode auto-apply doesn't see stale data
    // after an atomic save. Only for non-hidden secrets since hidden secrets
    // never fetch sharedValueData.
    if (isValueDirty && !secretValueHidden) {
      originalValueRef.current = value ?? null;
    }
    if (secretValueHidden) {
      setTimeout(() => {
        reset({
          value: defaultValue || null,
          ...(isSingleEnvView ? { key: key || secretName } : {})
        });
      }, 50);
    } else {
      reset({
        value,
        ...(isSingleEnvView ? { key: key || secretName } : {})
      });
    }
  };

  const handleEditSecret = async ({
    secretValue,
    newKey
  }: {
    secretValue: string;
    newKey?: string;
  }) => {
    await onSecretUpdate({
      env: environment,
      key: secretName,
      value: secretValue,
      secretValueHidden,
      type: SecretType.Shared,
      secretId,
      newSecretName: newKey
    });
    if (!secretValueHidden) {
      originalValueRef.current = secretValue;
    }
    reset({
      value: secretValue,
      ...(isSingleEnvView ? { key: newKey || secretName } : {})
    });
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
    isPendingDelete ||
    isImportedSecret ||
    isRotatedSecret ||
    isFetchingSharedValue ||
    isErrorFetchingSharedValue ||
    (isCreatable ? !canCreate : !canEditSecretValue);

  const shouldStayExpanded =
    isCommentOpen || isTagOpen || isMetadataOpen || isReminderOpen || isDropdownOpen;

  const getTooltipContentForSecretSharing = () => {
    if (!currentProject.secretSharing) {
      return "Secret Sharing Disabled";
    }

    if (secretValueHidden) {
      return "Access Denied";
    }

    if (isCreatable && !importedSecret) {
      return "Create Secret to Share";
    }

    return "Share Secret";
  };

  const nameInput = isSingleEnvView ? (
    <Controller
      control={control}
      name="key"
      render={({ field, fieldState: { error } }) => (
        <Input
          autoComplete="off"
          isReadOnly={isPendingDelete || isImportedSecret || isRotatedSecret || !canEditSecretValue}
          autoCapitalization={currentProject?.autoCapitalization}
          variant="plain"
          placeholder={error?.message || "Secret name"}
          isError={Boolean(error)}
          {...field}
          value={field.value ?? ""}
          className={twMerge(
            "w-full px-0 text-foreground placeholder:text-red-500 focus:ring-transparent",
            isPendingDelete && "text-danger/75 line-through"
          )}
          onBlur={(e) => {
            field.onBlur();
            if (!isBatchMode && field.onChange) field.onChange(e);
          }}
        />
      )}
    />
  ) : null;

  const valueContent = (
    <>
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
          {isDirty && !isImportedSecret && !isBatchMode ? (
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
                      isPendingDelete ||
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
                    isDisabled={isPendingDelete || !canCopySecret}
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
                  {canCopySecret
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
                        isDisabled={isPendingDelete || isCreatable || isImportedSecret}
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
                    comment={isBatchMode ? ((watchedComment as string) ?? comment) : comment}
                    secretKey={secretName}
                    secretPath={secretPath}
                    environment={environment}
                    onClose={() => setIsCommentOpen(false)}
                    isBatchMode={isBatchMode}
                    onCommentChange={handleCommentChange}
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
                        isDisabled={
                          isPendingDelete || isCreatable || isImportedSecret || !canReadTags
                        }
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
                    tags={isBatchMode ? ((watchedTags as WsTag[]) ?? tags) : tags}
                    onClose={() => setIsTagOpen(false)}
                    isBatchMode={isBatchMode}
                    onTagsChange={handleTagsChange}
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
                        isDisabled={
                          isPendingCreate ||
                          isPendingDelete ||
                          isCreatable ||
                          isImportedSecret ||
                          !secretId
                        }
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
                        isDisabled={isPendingDelete || isCreatable || isImportedSecret}
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
                    secretMetadata={
                      isBatchMode
                        ? ((watchedMetadata as {
                            key: string;
                            value: string;
                            isEncrypted?: boolean;
                          }[]) ?? secretMetadata)
                        : secretMetadata
                    }
                    secretKey={secretName}
                    secretPath={secretPath}
                    environment={environment}
                    onClose={() => setIsMetadataOpen(false)}
                    isBatchMode={isBatchMode}
                    onMetadataChange={handleMetadataChange}
                  />
                </PopoverContent>
              </Popover>
              <Tooltip delayDuration={300} disableHoverableContent>
                <TooltipTrigger>
                  <UnstableIconButton
                    variant="ghost"
                    size="xs"
                    isDisabled={
                      isPendingDelete ||
                      isCreatable ||
                      isImportedSecret ||
                      !canEditSecretValue ||
                      isUpdatingMultiline
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

                      const { data, error } = await refetchSharedValue();
                      if (data) {
                        handlePopUpOpen("createSharedSecret", { value: data.value });
                      } else {
                        createNotification({
                          type: "error",
                          title: "Failed to fetch secret value",
                          text: (error as Error)?.message ?? "Please try again later"
                        });
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
                <TooltipContent>{getTooltipContentForSecretSharing()}</TooltipContent>
              </Tooltip>
              {isBatchMode && hasPendingChange ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <UnstableIconButton
                      variant="ghost"
                      className="hover:text-error"
                      size="xs"
                      onClick={() => onBatchRevert?.(environment, secretName)}
                    >
                      <Undo2Icon />
                    </UnstableIconButton>
                  </TooltipTrigger>
                  <TooltipContent>Discard pending changes</TooltipContent>
                </Tooltip>
              ) : (
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
                              isDisabled={
                                isCreatable || isImportedSecret || isOverride || !isAllowed
                              }
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
                              isDisabled={
                                !secretId || isCreatable || isImportedSecret || !isAllowed
                              }
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
              )}
              <Modal isOpen={isSecretReferenceOpen} onOpenChange={setIsSecretReferenceOpen}>
                <ModalContent
                  className="max-w-3xl"
                  title="Secret Reference Details"
                  subTitle="Visual breakdown of secrets referenced by this secret."
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <SecretReferenceTree
                    secretPath={secretPath}
                    environment={environment}
                    secretKey={secretName}
                    onClose={() => setIsSecretReferenceOpen(false)}
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
    </>
  );

  if (isSingleEnvView) {
    return (
      <>
        <UnstableTableCell
          className={twMerge("border-r pt-1 align-top", isOverride && "border-b-border/50")}
        >
          {nameInput}
        </UnstableTableCell>
        <UnstableTableCell
          className={twMerge("w-full p-0 px-2", isOverride && "border-b-border/50")}
        >
          <div className="flex w-full flex-col gap-y-2 py-1.5">{valueContent}</div>
        </UnstableTableCell>
        <AddShareSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      </>
    );
  }

  return <div className="flex w-full flex-col gap-y-2 py-1.5">{valueContent}</div>;
};
