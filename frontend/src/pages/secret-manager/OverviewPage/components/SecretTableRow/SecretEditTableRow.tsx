/* eslint-disable no-nested-ternary */
import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import {
  BanIcon,
  BellIcon,
  ClipboardCheckIcon,
  CodeXmlIcon,
  CopyIcon,
  CopyPlus,
  EditIcon,
  EllipsisIcon,
  EyeOffIcon,
  ForwardIcon,
  GitBranchIcon,
  HistoryIcon,
  MessageSquareIcon,
  PencilLineIcon,
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
import {
  hasSecretReference,
  ResolvedSecretValuePopover,
  SecretReferenceTree
} from "@app/components/secrets/SecretReferenceDetails";
import { Input, Modal, ModalContent } from "@app/components/v2";
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
  Badge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Field,
  FieldContent,
  FieldLabel,
  IconButton,
  Input as V3Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  TableCell,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp, useTimedReset, useToggle } from "@app/hooks";
import { useUpdateSecretV3 } from "@app/hooks/api";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { Reminder } from "@app/hooks/api/reminders/types";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { ProjectEnv, SecretType, SecretV3RawSanitized, WsTag } from "@app/hooks/api/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";
import { AddShareSecretModal } from "@app/pages/organization/SecretSharingPage/components/ShareSecret/AddShareSecretModal";
import { CollapsibleSecretImports } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/CollapsibleSecretImports";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";
import { useBatchStoreApi } from "@app/pages/secret-manager/SecretDashboardPage/SecretMainPage.store";

import { DuplicateSecretModal } from "./DuplicateSecretModal";
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
    originalValue?: string;
  }) => Promise<void>;
  onSecretDelete: (env: string, key: string, secretId?: string, type?: SecretType) => Promise<void>;
  onAddOverride?: () => void;
  isRotatedSecret?: boolean;
  isHoneyTokenSecret?: boolean;
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
    project?: { name: string; slug: string; id: string };
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
  revokedProjectGrant?: boolean;
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
  isHoneyTokenSecret,
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
  pendingKeyName,
  revokedProjectGrant
}: Props) => {
  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "editSecret",
    "accessInsightsUpgrade",
    "createSharedSecret",
    "duplicateSecret"
  ] as const);

  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const batchStore = useBatchStoreApi();

  const isManagedSecret = isRotatedSecret || isHoneyTokenSecret;
  // When a row has a queued batch change, immediate (non-batch) actions must be disabled so they
  // can't conflict with the pending change. Annotation edits remain available since they queue too.
  const isPendingBatchChange = isBatchMode && hasPendingChange;

  const [isFieldFocused, setIsFieldFocused] = useToggle();
  const [isResolvedValueOpen, setIsResolvedValueOpen] = useToggle();
  const isFieldActive = isFieldFocused || isResolvedValueOpen;
  const [isCopied, , setIsCopied] = useTimedReset<boolean>({ initialState: false });

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
    enabled: canFetchSharedValue && (isVisible || isFieldActive)
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
    formState: { isDirty, dirtyFields, isSubmitting }
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
      reset((prev) => ({ ...prev, value: sharedValueData.value ?? null }), {
        keepDirtyValues: true
      });
      originalValueRef.current = sharedValueData.value ?? null;
    }
  }, [sharedValueData]);

  const { permission } = useProjectPermission();
  const { mutateAsync: updateSecretV3, isPending: isUpdatingMultiline } = useUpdateSecretV3();

  const [isDeleting, setIsDeleting] = useToggle();
  const [isEditing, setIsEditing] = useToggle();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [editConfirmation, setEditConfirmation] = useState("");
  const [isCommentOpen, setIsCommentOpen] = useState(false);
  const [isTagOpen, setIsTagOpen] = useState(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<
    "comment" | "tags" | "reminder" | "metadata" | null
  >(null);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isAccessInsightsOpen, setIsAccessInsightsOpen] = useState(false);
  const [isSecretReferenceOpen, setIsSecretReferenceOpen] = useState(false);

  const toggleModal = useCallback(() => {
    setIsModalOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!isModalOpen) setDeleteConfirmation("");
  }, [isModalOpen]);

  useEffect(() => {
    if (!popUp.editSecret.isOpen) setEditConfirmation("");
  }, [popUp.editSecret.isOpen]);

  const originalCommentRef = useRef(comment ?? "");
  const originalTagsRef = useRef(tags?.map((t) => ({ id: t.id, slug: t.slug })) ?? []);
  const originalMetadataRef = useRef(
    secretMetadata?.map((m) => ({
      key: m.key,
      value: m.value,
      isEncrypted: m.isEncrypted ?? false
    })) ?? []
  );

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

      // Compare against true originals, not form defaults (which shift after reset).
      // Normalize null/undefined to "" so clearing a value to empty is detected as a change.
      const isValueChanged = (watchedValue ?? "") !== (originalValueRef.current ?? "");
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

        // A server key is "freed" if there's a pending rename away from it
        const isServerKeyFreed = (key: string) =>
          pc.secrets.some(
            (s) =>
              s.type === PendingAction.Update &&
              s.secretKey === key &&
              s.newSecretName &&
              s.newSecretName !== key
          );

        const isTaken =
          (existingSecretKeys.has(newKey) && !isServerKeyFreed(newKey)) ||
          pc.secrets.some(
            (s) =>
              s.id !== secretId &&
              // Match the effective key: for renames use newSecretName, otherwise secretKey
              ((s.type === PendingAction.Update && s.newSecretName
                ? s.newSecretName === newKey
                : s.secretKey === newKey) ||
                // Also check if a create uses this key
                (s.type === PendingAction.Create && s.secretKey === newKey))
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
          value: isValueChanged ? ((watchedValue as string) ?? "") : undefined,
          secretValueHidden,
          type: SecretType.Shared,
          secretId,
          newSecretName: effectiveKeyDirty ? (watchedKey as string) : undefined,
          secretComment: isCommentDirty ? (watchedComment as string) : undefined,
          tags: isTagsDirty ? watchedTags : undefined,
          secretMetadata: isMetadataDirty ? watchedMetadata : undefined,
          originalValue: originalValueRef.current ?? undefined
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
      if (isPendingCreate || (isBatchMode && hasPendingValueChange)) {
        // In batch mode with a queued value change, copy the pending value shown in the field
        // rather than refetching the (stale) committed server value.
        await window.navigator.clipboard.writeText((watchedValue as string) ?? "");
      } else {
        const { data } = await refetchSharedValue();
        await window.navigator.clipboard.writeText(data?.value ?? "");
      }
      setIsCopied(true);
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
    if (isEditing) return;
    setIsEditing.on();
    try {
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
    } finally {
      setIsEditing.off();
    }
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
    if (isDeleting) return;
    setIsDeleting.on();
    try {
      await onSecretDelete(environment, secretName, secretId);
      reset({ value: null });
      setIsModalOpen(false);
    } finally {
      setIsDeleting.off();
    }
  }, [isDeleting, onSecretDelete, environment, secretName, secretId, reset, setIsDeleting]);

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
    isManagedSecret ||
    isFetchingSharedValue ||
    isErrorFetchingSharedValue ||
    (isCreatable ? !canCreate : !canEditSecretValue);

  const shouldStayExpanded =
    isCommentOpen || isTagOpen || isMetadataOpen || isReminderOpen || isDropdownOpen;

  const [isHoveringActionZone, setIsHoveringActionZone] = useState(false);
  const showMenuWhileFocused = isHoveringActionZone || shouldStayExpanded;

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
          isReadOnly={isPendingDelete || isImportedSecret || isManagedSecret || !canEditSecretValue}
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

  const isDirtyState =
    isDirty && (dirtyFields.key || dirtyFields.value) && !isImportedSecret && !isBatchMode;

  const secretHasReference = hasSecretReference(watchedValue as string);

  const valueContent = (
    <>
      <AlertDialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TrashIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Are you sure you want to delete {secretName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the secret from this environment. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (deleteConfirmation === secretName) handleDeleteSecret();
            }}
          >
            <Field>
              <FieldLabel>
                Type <span className="font-bold">{secretName}</span> to confirm
              </FieldLabel>
              <FieldContent>
                <V3Input
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder={`Type ${secretName} here`}
                  autoComplete="off"
                />
              </FieldContent>
            </Field>
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={(e) => {
                e.preventDefault();
                handleDeleteSecret();
              }}
              disabled={deleteConfirmation !== secretName || isDeleting}
            >
              Delete Secret
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex w-full cursor-text items-center space-x-2">
        {secretValueHidden && (
          <Tooltip>
            <TooltipTrigger asChild>
              <EyeOffIcon className="size-4 text-secret" />
            </TooltipTrigger>
            <TooltipContent>
              You do not have access to view the current value
              {canEditSecretValue && !isManagedSecret ? ", but you can set a new one" : "."}
            </TooltipContent>
          </Tooltip>
        )}
        <div
          className={twMerge(
            "relative grow pr-2 pl-1",
            isFieldActive && !isBatchMode && "pr-16",
            isFieldActive && isBatchMode && "pr-6"
          )}
        >
          {isFieldActive && !secretValueHidden && !isCreatable && secretHasReference && (
            <ResolvedSecretValuePopover
              environment={environment}
              secretPath={secretPath}
              secretKey={secretName}
              open={isResolvedValueOpen}
              onOpenChange={setIsResolvedValueOpen.toggle}
              isDisabled={isDirtyState || hasPendingValueChange}
            />
          )}
          <Controller
            control={control}
            name="value"
            render={({ field }) => (
              <InfisicalSecretInput
                {...field}
                isReadOnly={isReadOnly}
                value={
                  secretValueHidden
                    ? ((field.value as string) ?? "")
                    : isFetchingSharedValue
                      ? HIDDEN_SECRET_VALUE
                      : isErrorFetchingSharedValue
                        ? "Error fetching secret value..."
                        : (field.value as string)
                }
                key="secret-input-shared"
                isVisible={isVisible || isResolvedValueOpen}
                secretPath={secretPath}
                environment={environment}
                isImport={isImportedSecret}
                defaultValue={secretValueHidden ? "" : undefined}
                canEditButNotView={secretValueHidden && !isManagedSecret}
                onFocus={() => setIsFieldFocused.on()}
                containerClassName={secretHasReference && isFieldActive ? "pl-6" : ""}
                onBlur={() => {
                  field.onBlur();
                  setIsFieldFocused.off();
                }}
              />
            )}
          />
        </div>
        {!isDirtyState && !isFieldActive && (
          <div className="flex w-fit items-start justify-end self-start pl-2 transition-opacity group-hover:pointer-events-none group-hover:opacity-0">
            <div className="flex items-center gap-1">
              {comment && !isImportedSecret && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex size-5 items-center justify-center text-muted">
                      <MessageSquareIcon className="size-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Has comment</TooltipContent>
                </Tooltip>
              )}
              {canReadTags && tags?.length && !isImportedSecret ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex size-5 items-center justify-center text-muted">
                      <TagsIcon className="size-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {tags.length} tag{tags.length > 1 ? "s" : ""}
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {reminder && !isImportedSecret && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex size-5 items-center justify-center text-muted">
                      <BellIcon className="size-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Has reminder</TooltipContent>
                </Tooltip>
              )}
              {secretMetadata?.length && !isImportedSecret ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex size-5 items-center justify-center text-muted">
                      <CodeXmlIcon className="size-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Has metadata</TooltipContent>
                </Tooltip>
              ) : null}
              {skipMultilineEncoding && !isImportedSecret && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex size-5 items-center justify-center text-muted">
                      <WrapTextIcon className="size-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Multi-line encoding disabled</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        )}
        {revokedProjectGrant && !isDirtyState && (
          <div
            className={twMerge(
              "ml-auto flex shrink-0 items-center",
              isSingleEnvView && "transition-[margin] duration-300 group-hover:mr-16",
              isSingleEnvView && isFieldActive && "mr-8"
            )}
          >
            <Badge variant="danger">
              <BanIcon className="size-3.5" />
              Access Revoked
            </Badge>
          </div>
        )}
      </div>
      {isDirtyState && (
        <div
          className={twMerge(
            "absolute z-20 flex items-center gap-1.5 px-0.5 py-0.5",
            isSingleEnvView ? "top-0.5 right-0.5" : "top-[0.25px] -right-1.5"
          )}
        >
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
                    <IconButton
                      size="xs"
                      variant="success"
                      isDisabled={isSubmitting || !isAllowed}
                      onClick={handleSubmit(handleFormSubmit)}
                    >
                      <SaveIcon />
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent>Save changes</TooltipContent>
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
              <TooltipContent>Undo changes</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
      {isFieldActive &&
        !(
          isDirty &&
          (dirtyFields.key || dirtyFields.value) &&
          !isImportedSecret &&
          !isBatchMode
        ) && (
          <div
            className={twMerge(
              "absolute top-0 bottom-0 z-10 flex w-8 cursor-pointer items-start justify-center",
              isSingleEnvView ? "right-0 pt-[11px] pr-[6px]" : "-right-3 pt-[8px] pr-[12px]"
            )}
            onMouseEnter={() => setIsHoveringActionZone(true)}
            onMouseLeave={() => setIsHoveringActionZone(false)}
          >
            <EllipsisIcon className="animate-fade-in text-muted-foreground/40 size-4" />
          </div>
        )}
      {!(
        isDirty &&
        (dirtyFields.key || dirtyFields.value) &&
        !isImportedSecret &&
        !isBatchMode
      ) && (
        <div
          onMouseEnter={() => setIsHoveringActionZone(true)}
          onMouseLeave={() => setIsHoveringActionZone(false)}
          className={twMerge(
            "absolute z-20",
            "flex items-center gap-0.5 rounded-md border border-border bg-container-hover px-0.5 py-0.5 shadow-md",
            "pointer-events-none opacity-0 transition-all duration-300",
            "group-hover:pointer-events-auto group-hover:opacity-100",
            shouldStayExpanded && "pointer-events-auto opacity-100",
            isFieldActive &&
              !showMenuWhileFocused &&
              "group-hover:pointer-events-none group-hover:opacity-0",
            isFieldActive && showMenuWhileFocused && "pointer-events-auto opacity-100",
            isSingleEnvView ? "top-[3px] right-0.5" : "-top-px -right-1.5"
          )}
        >
          <Popover open={isCommentOpen} onOpenChange={setIsCommentOpen}>
            <PopoverAnchor asChild>
              <span className="pointer-events-none absolute inset-0" />
            </PopoverAnchor>
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
            <PopoverAnchor asChild>
              <span className="pointer-events-none absolute inset-0" />
            </PopoverAnchor>
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
            <PopoverAnchor asChild>
              <span className="pointer-events-none absolute inset-0" />
            </PopoverAnchor>
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
            <PopoverAnchor asChild>
              <span className="pointer-events-none absolute inset-0" />
            </PopoverAnchor>
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
          {isPendingBatchChange && (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  variant="ghost"
                  className="hover:text-error size-7 border-0"
                  size="xs"
                  onClick={() => onBatchRevert?.(environment, secretName)}
                >
                  <Undo2Icon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Discard pending changes</TooltipContent>
            </Tooltip>
          )}
          {!isImportedSecret &&
            !isCreatable &&
            !isPendingDelete &&
            !!(comment || (canReadTags && tags?.length) || reminder || secretMetadata?.length) && (
              <>
                {comment && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        variant="ghost"
                        size="xs"
                        className="size-7 border-0 text-muted hover:text-foreground"
                        onClick={() => setIsCommentOpen(true)}
                      >
                        <MessageSquareIcon className="size-3.5" />
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent>View Comment</TooltipContent>
                  </Tooltip>
                )}
                {canReadTags && tags?.length ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        variant="ghost"
                        size="xs"
                        className="size-7 border-0 text-muted hover:text-foreground"
                        onClick={() => setIsTagOpen(true)}
                      >
                        <TagsIcon className="size-3.5" />
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent>View Tags</TooltipContent>
                  </Tooltip>
                ) : null}
                {reminder && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        variant="ghost"
                        size="xs"
                        className="size-7 border-0 text-muted hover:text-foreground"
                        onClick={() => setIsReminderOpen(true)}
                      >
                        <BellIcon className="size-3.5" />
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent>View Reminder</TooltipContent>
                  </Tooltip>
                )}
                {secretMetadata?.length ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        variant="ghost"
                        size="xs"
                        className="size-7 border-0 text-muted hover:text-foreground"
                        onClick={() => setIsMetadataOpen(true)}
                      >
                        <CodeXmlIcon className="size-3.5" />
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent>View Metadata</TooltipContent>
                  </Tooltip>
                ) : null}
                <div className="mx-0.5 h-4 w-px bg-border" />
              </>
            )}
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                variant="ghost"
                size="xs"
                className="size-7 border-0 text-muted hover:text-foreground"
                isDisabled={
                  isPendingDelete ||
                  isImportedSecret ||
                  isManagedSecret ||
                  (isCreatable ? !canCreate : !canEditSecretValue)
                }
                onClick={() => {
                  setFocus("value", { shouldSelect: true });
                }}
              >
                <EditIcon className="size-3.5" />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>
              {isImportedSecret
                ? "Cannot Edit Imported Secret"
                : isHoneyTokenSecret
                  ? "Cannot Edit Honey Token Secret"
                  : isRotatedSecret
                    ? "Cannot Edit Rotated Secret"
                    : (isCreatable ? !canCreate : !canEditSecretValue)
                      ? "Access Denied"
                      : isCreatable
                        ? "Add Value"
                        : "Edit Value"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                variant="ghost"
                size="xs"
                className="size-7 border-0 text-muted hover:text-foreground"
                isDisabled={isPendingDelete || !canCopySecret}
                onClick={handleCopySharedToClipboard}
              >
                {isCopied ? (
                  <ClipboardCheckIcon className="size-3.5" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>
              {!canCopySecret
                ? canReadSecretValue
                  ? "No Secret Value"
                  : "Access Denied"
                : isCopied
                  ? "Copied"
                  : "Copy Secret"}
            </TooltipContent>
          </Tooltip>
          <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    className="size-7 border-0 text-muted hover:text-foreground"
                  >
                    <EllipsisIcon />
                  </IconButton>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Secret Actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align="end"
              className="min-w-[200px] [&_[data-variant=default]]:text-mineshaft-100 [&_[data-variant=default]:focus]:text-foreground [&_svg:not([class*='size-'])]:!size-3"
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                if (pendingAnnotation === "comment") setIsCommentOpen(true);
                else if (pendingAnnotation === "tags") setIsTagOpen(true);
                else if (pendingAnnotation === "reminder") setIsReminderOpen(true);
                else if (pendingAnnotation === "metadata") setIsMetadataOpen(true);
                setPendingAnnotation(null);
              }}
            >
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  disabled={isPendingDelete || isCreatable || isImportedSecret}
                  className={twMerge(
                    "px-2.5 py-1.5 text-xs",
                    (comment ||
                      (canReadTags && tags?.length) ||
                      reminder ||
                      secretMetadata?.length) &&
                      !isImportedSecret &&
                      "[&>svg:first-child]:text-project"
                  )}
                >
                  <PencilLineIcon />
                  Annotate
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-[185px]">
                  <DropdownMenuItem
                    className="px-2.5 py-1.5 text-xs"
                    onClick={() => setPendingAnnotation("comment")}
                  >
                    <MessageSquareIcon className={twMerge(comment && "text-project")} />
                    {comment ? "View Comment" : "Add Comment"}
                  </DropdownMenuItem>
                  <Tooltip open={!canReadTags ? undefined : false} disableHoverableContent>
                    <TooltipTrigger className="block w-full">
                      <DropdownMenuItem
                        className="px-2.5 py-1.5 text-xs"
                        isDisabled={!canReadTags}
                        onClick={() => setPendingAnnotation("tags")}
                      >
                        <TagsIcon
                          className={twMerge(canReadTags && tags?.length && "text-project")}
                        />
                        {tags?.length ? "View Tags" : "Add Tags"}
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side="left">Access Denied</TooltipContent>
                  </Tooltip>
                  <Tooltip
                    open={!secretId || isPendingCreate ? undefined : false}
                    disableHoverableContent
                  >
                    <TooltipTrigger className="block w-full">
                      <DropdownMenuItem
                        className="px-2.5 py-1.5 text-xs"
                        isDisabled={!secretId || isPendingCreate}
                        onClick={() => setPendingAnnotation("reminder")}
                      >
                        <BellIcon className={twMerge(reminder && "text-project")} />
                        {reminder ? "View Reminder" : "Add Reminder"}
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side="left">Create Secret to Add Reminder</TooltipContent>
                  </Tooltip>
                  <DropdownMenuItem
                    className="px-2.5 py-1.5 text-xs"
                    onClick={() => setPendingAnnotation("metadata")}
                  >
                    <CodeXmlIcon className={twMerge(secretMetadata?.length && "text-project")} />
                    {secretMetadata?.length ? "View Metadata" : "Add Metadata"}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <div className="my-1" />
              <DropdownMenuLabel className="px-2.5 py-0.5 text-[10px]">Insights</DropdownMenuLabel>
              <Tooltip
                open={!canReadSecretValue || !secretId || isEmpty ? undefined : false}
                disableHoverableContent
              >
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem
                    className="px-2.5 py-1.5 text-xs"
                    onClick={() => setIsSecretReferenceOpen(true)}
                    isDisabled={!canReadSecretValue || !secretId || isEmpty}
                  >
                    <WorkflowIcon />
                    Secret References
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {!canReadSecretValue ? "Access Denied" : "Create Secret to View References"}
                </TooltipContent>
              </Tooltip>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Read}
                a={ProjectPermissionSub.Commits}
              >
                {(isAllowed) => (
                  <Tooltip
                    open={
                      isPendingBatchChange || isImportedSecret || isCreatable || !isAllowed
                        ? undefined
                        : false
                    }
                    disableHoverableContent
                  >
                    <TooltipTrigger className="block w-full">
                      <DropdownMenuItem
                        className="px-2.5 py-1.5 text-xs"
                        onClick={() => setIsVersionHistoryOpen(true)}
                        isDisabled={
                          isPendingBatchChange ||
                          !secretId ||
                          isCreatable ||
                          isImportedSecret ||
                          !isAllowed
                        }
                      >
                        <HistoryIcon />
                        Version History
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {isPendingBatchChange
                        ? "Discard Pending Changes First"
                        : !isAllowed
                          ? "Access Denied"
                          : isImportedSecret
                            ? "Cannot View Version History for Imported Secret"
                            : "Create Secret to View History"}
                    </TooltipContent>
                  </Tooltip>
                )}
              </ProjectPermissionCan>
              <Tooltip
                open={isPendingBatchChange || isImportedSecret || isCreatable ? undefined : false}
                disableHoverableContent
              >
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem
                    className="px-2.5 py-1.5 text-xs"
                    onClick={() => {
                      if (!subscription?.secretAccessInsights) {
                        handlePopUpOpen("accessInsightsUpgrade");
                      } else {
                        setIsAccessInsightsOpen(true);
                      }
                    }}
                    isDisabled={
                      isPendingBatchChange || !secretId || isCreatable || isImportedSecret
                    }
                  >
                    <UsersIcon />
                    View Access
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {isPendingBatchChange
                    ? "Discard Pending Changes First"
                    : isImportedSecret
                      ? "Cannot View Access for Imported Secret"
                      : "Create Secret to View Access"}
                </TooltipContent>
              </Tooltip>

              <div className="my-1" />
              <DropdownMenuLabel className="px-2.5 py-0.5 text-[10px]">Manage</DropdownMenuLabel>
              <Tooltip
                open={
                  isPendingDelete || isCreatable || isImportedSecret || !canEditSecretValue
                    ? undefined
                    : false
                }
                disableHoverableContent
              >
                <TooltipTrigger className="block w-full">
                  <DropdownMenuCheckboxItem
                    checked={Boolean(skipMultilineEncoding)}
                    disabled={
                      isPendingDelete ||
                      isCreatable ||
                      isImportedSecret ||
                      !canEditSecretValue ||
                      isUpdatingMultiline
                    }
                    onCheckedChange={() => handleToggleMultilineEncoding()}
                    onSelect={(e) => e.preventDefault()}
                    className="px-2.5 py-1.5 text-xs"
                  >
                    <WrapTextIcon />
                    Multi-line Encoding
                  </DropdownMenuCheckboxItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {isImportedSecret
                    ? "Cannot Edit Multi-line Encoding on Imported Secret"
                    : isCreatable
                      ? "Create Secret to Edit Multi-line Encoding"
                      : !canEditSecretValue
                        ? "Access Denied"
                        : ""}
                </TooltipContent>
              </Tooltip>
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
                      isPendingBatchChange ||
                      isCreatable ||
                      isImportedSecret ||
                      isOverride ||
                      !isAllowed
                        ? undefined
                        : false
                    }
                    disableHoverableContent
                  >
                    <TooltipTrigger className="block w-full">
                      <DropdownMenuItem
                        className="px-2.5 py-1.5 text-xs"
                        onClick={() => onAddOverride?.()}
                        isDisabled={
                          isPendingBatchChange ||
                          isCreatable ||
                          isImportedSecret ||
                          isOverride ||
                          !isAllowed
                        }
                      >
                        <GitBranchIcon />
                        Add Override
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {isPendingBatchChange
                        ? "Discard Pending Changes First"
                        : !isAllowed
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
                open={
                  isPendingBatchChange ||
                  !currentProject.secretSharing ||
                  secretValueHidden ||
                  (isCreatable && !isImportedSecret)
                    ? undefined
                    : false
                }
                disableHoverableContent
              >
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem
                    className="px-2.5 py-1.5 text-xs"
                    isDisabled={
                      isPendingBatchChange ||
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
                  >
                    <ForwardIcon />
                    Share Secret
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {isPendingBatchChange
                    ? "Discard Pending Changes First"
                    : getTooltipContentForSecretSharing()}
                </TooltipContent>
              </Tooltip>
              <Tooltip
                open={isPendingBatchChange || isManagedSecret || isCreatable ? undefined : false}
                disableHoverableContent
              >
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem
                    className="px-2.5 py-1.5 text-xs"
                    onClick={() => handlePopUpOpen("duplicateSecret")}
                    isDisabled={isPendingBatchChange || isManagedSecret || isCreatable || !secretId}
                  >
                    <CopyPlus />
                    Duplicate Secret
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {isPendingBatchChange
                    ? "Discard Pending Changes First"
                    : isCreatable
                      ? "Create Secret First"
                      : isHoneyTokenSecret
                        ? "Cannot Duplicate Honey Token Secret"
                        : isRotatedSecret
                          ? "Cannot Duplicate Rotated Secret"
                          : "Duplicate Secret"}
                </TooltipContent>
              </Tooltip>

              <DropdownMenuSeparator className="mt-1 mb-1.5" />
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
                      isPendingBatchChange || isManagedSecret || isImportedSecret || isCreatable
                        ? undefined
                        : false
                    }
                    disableHoverableContent
                  >
                    <TooltipTrigger className="block w-full">
                      <DropdownMenuItem
                        className="px-2.5 py-1.5 text-xs"
                        onClick={toggleModal}
                        isDisabled={
                          isPendingBatchChange ||
                          isCreatable ||
                          isDeleting ||
                          !isAllowed ||
                          isManagedSecret ||
                          isImportedSecret
                        }
                        variant="danger"
                      >
                        <TrashIcon />
                        Delete Secret
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {isPendingBatchChange
                        ? "Discard Pending Changes First"
                        : isHoneyTokenSecret
                          ? "Cannot Delete Honey Token Secret"
                          : isRotatedSecret
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
        <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} className="gap-y-0" side="right">
          <SheetHeader>
            <SheetTitle>Version History</SheetTitle>
            <SheetDescription>Audit secret history and rollback changes</SheetDescription>
          </SheetHeader>
          <Separator />
          <div className="bg-container p-4 text-foreground">
            <p className="truncate">{secretName}</p>
            <Badge variant="neutral" className="mt-0.5">
              {environmentName}
            </Badge>
          </div>
          <Separator />
          {secretId && (
            <SecretVersionHistory
              secretId={secretId}
              secretKey={secretName}
              environment={environment}
              secretPath={secretPath}
              isRotatedSecret={isManagedSecret ?? false}
              canReadValue={canReadSecretValue}
            />
          )}
        </SheetContent>
      </Sheet>
      <Sheet open={isAccessInsightsOpen} onOpenChange={setIsAccessInsightsOpen}>
        <SheetContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="gap-y-0 sm:max-w-6xl"
          side="right"
        >
          <SheetHeader>
            <SheetTitle>Secret Access Insights</SheetTitle>
            <SheetDescription>
              View and manage user, group, and machine identity access to this secret
            </SheetDescription>
          </SheetHeader>
          <Separator />
          <div className="bg-container p-4 text-foreground">
            <p className="truncate">{secretName}</p>
            <Badge variant="neutral" className="mt-0.5">
              {environmentName}
            </Badge>
          </div>
          <Separator />
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

      <AlertDialog
        open={popUp.editSecret.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editSecret", isOpen)}
      >
        <AlertDialogContent className="sm:max-w-4xl!">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <SaveIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Update this secret?</AlertDialogTitle>
            <AlertDialogDescription>
              This secret is referenced by other secrets in your project. Saving these changes will
              update everywhere it&apos;s referenced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {importedBy && importedBy.length > 0 && (
            <CollapsibleSecretImports
              importedBy={importedBy}
              secretsToDelete={[secretName]}
              onlyReferences
            />
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editConfirmation === "confirm") handleEditSecret(popUp?.editSecret?.data);
            }}
          >
            <Field>
              <FieldLabel>
                Type <span className="font-bold">confirm</span> to proceed
              </FieldLabel>
              <FieldContent>
                <V3Input
                  value={editConfirmation}
                  onChange={(e) => setEditConfirmation(e.target.value)}
                  placeholder="Type confirm here"
                  autoComplete="off"
                />
              </FieldContent>
            </Field>
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="project"
              onClick={(e) => {
                e.preventDefault();
                handleEditSecret(popUp?.editSecret?.data);
              }}
              disabled={editConfirmation !== "confirm" || isEditing}
            >
              Save Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AddShareSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DuplicateSecretModal
        isOpen={popUp.duplicateSecret.isOpen}
        onOpenChange={(open) => handlePopUpToggle("duplicateSecret", open)}
        secrets={secretId ? [{ id: secretId, name: secretName }] : []}
        secretPath={secretPath}
        sourceEnvironment={{ slug: environment, name: environmentName }}
        canCopySecretValue={!secretValueHidden}
      />
    </>
  );

  if (isSingleEnvView) {
    return (
      <>
        <TableCell
          className={twMerge("border-r pt-1 align-top", isOverride && "border-b-border/50")}
        >
          {nameInput}
        </TableCell>
        <TableCell
          className={twMerge("relative w-full p-0 px-2", isOverride && "border-b-border/50")}
        >
          <div className="flex w-full flex-col gap-y-2 py-1.5">{valueContent}</div>
        </TableCell>
      </>
    );
  }

  return <div className="relative flex w-full flex-col gap-y-2 py-1.5">{valueContent}</div>;
};
