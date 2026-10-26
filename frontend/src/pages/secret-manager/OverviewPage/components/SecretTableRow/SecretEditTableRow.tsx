/* eslint-disable no-nested-ternary */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  hasSecretReference,
  ResolvedSecretValuePopover,
  SecretReferenceTree
} from "@app/components/secrets/SecretReferenceDetails";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Badge,
  ConfirmationAlertDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DiscardChangesAlertDialog,
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
  IconButton,
  InfisicalSecretInput,
  Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
  SecretInputActions,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  TableCell,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useSecretInputActionShortcuts
} from "@app/components/v3";
import { HIDDEN_SECRET_VALUE } from "@app/const/secrets";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useDiscardChangesGuard, usePopUp, useTimedReset, useToggle } from "@app/hooks";
import { useUpdateSecretV3 } from "@app/hooks/api";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { Reminder } from "@app/hooks/api/reminders/types";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { ProjectEnv, SecretType, SecretV3RawSanitized, WsTag } from "@app/hooks/api/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";
import { AddShareSecretModal } from "@app/pages/organization/SecretSharingPage/components/ShareSecret/AddShareSecretModal";
import { CollapsibleSecretImports } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/CollapsibleSecretImports";
import { useBatchStoreApi } from "@app/pages/secret-manager/SecretDashboardPage/SecretMainPage.store";

import { OverviewFlowHandle, useOverviewTelemetry } from "../../OverviewTelemetry";
import { CreateSecretForm, TSecretEditChanges } from "../CreateSecretForm/CreateSecretForm";
import {
  TABLE_ROW_ACTION_BAR_FORCE_VISIBLE_CLASS_NAME,
  TABLE_ROW_ACTION_BAR_VISIBILITY_CLASS_NAME
} from "../tableRowActionStyles";
import { SecretAccessInsights } from "./SecretAccessInsights";
import { SecretCommentForm } from "./SecretCommentForm";
import { SecretLastEditedTime } from "./SecretLastEditedTime";
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
  onPendingSave?: (env: string, key: string, pendingChangeId?: string) => Promise<void>;
  hasPendingChange?: boolean;
  hasPendingValueChange?: boolean;
  pendingKeyName?: string;
  revokedProjectFolderGrant?: boolean;
  onCopySecret?: () => void;
  onAccessInsightsUpgrade: (onGranted: () => void) => void;
  onExpandedChange?: (isExpanded: boolean) => void;
  lastEdited?: Pick<SecretV3RawSanitized, "createdAt" | "updatedAt" | "version">;
  timestampField?: "createdAt" | "updatedAt";
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
  lastEdited,
  timestampField,
  onBatchRevert,
  onPendingSave,
  hasPendingChange,
  hasPendingValueChange,
  pendingKeyName,
  revokedProjectFolderGrant,
  onCopySecret,
  onAccessInsightsUpgrade,
  onExpandedChange
}: Props) => {
  const telemetry = useOverviewTelemetry();
  const valueSheetFlow = useRef<OverviewFlowHandle>(undefined);
  const valueSheetOwner = useRef({});
  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "editSecret",
    "createSharedSecret"
  ] as const);
  const editConfirmation = useRef(popUp.editSecret);
  editConfirmation.current = popUp.editSecret;

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

  useEffect(() => {
    onExpandedChange?.(isFieldActive);
  }, [isFieldActive, onExpandedChange]);

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
    resetField,
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
  const [isSavingPendingChange, setIsSavingPendingChange] = useToggle();
  const [isEditing, setIsEditing] = useToggle();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isCommentOpen, setIsCommentOpen] = useState(false);
  const [commentDragOffset, setCommentDragOffset] = useState({ x: 0, y: 0 });
  const [commentSide, setCommentSide] = useState<"top" | "right" | "bottom" | "left">();
  const commentDragStart = useRef<{ pointerX: number; pointerY: number; x: number; y: number }>(
    undefined
  );
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
  const [valueEditDraft, setValueEditDraft] = useState<{ value: string; scope: string } | null>(
    null
  );
  const [isLoadingEditValue, setIsLoadingEditValue] = useState(false);
  const [isValueEditDirty, setIsValueEditDirty] = useState(false);
  const valueEditScope = JSON.stringify([
    currentProject.id,
    environment,
    secretPath,
    secretId,
    secretName
  ]);
  const closeValueSheet = (invocation = valueSheetFlow.current) => {
    if (invocation !== valueSheetFlow.current) return;
    valueSheetFlow.current?.flow({ phase: "canceled" });
    valueSheetFlow.current = undefined;
    valueSheetOwner.current = {};
    setIsValueEditDirty(false);
    setValueEditDraft(null);
  };
  useEffect(
    () => () => {
      valueSheetFlow.current?.flow({ phase: "canceled" });
      valueSheetFlow.current = undefined;
      valueSheetOwner.current = {};
    },
    [valueEditScope]
  );
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty: valueEditDraft?.scope === valueEditScope && isValueEditDirty,
      onDiscard: closeValueSheet
    });

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

  useLayoutEffect(() => {
    commentDragStart.current = undefined;
    if (!isCommentOpen) return;
    setCommentDragOffset({ x: 0, y: 0 });
    setCommentSide(undefined);
  }, [isCommentOpen]);

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
  const batchAutoApplyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const applyBatchEditsRef = useRef<() => void>(undefined);
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

    applyBatchEditsRef.current = () => {
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
    };
    batchAutoApplyTimer.current = setTimeout(() => applyBatchEditsRef.current?.(), 500);

    return () => {
      if (batchAutoApplyTimer.current) {
        clearTimeout(batchAutoApplyTimer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBatchMode, watchedValue, watchedKey, watchedComment, watchedTags, serializedMetadata]);

  const findPendingChangeId = () =>
    batchStore.getState().pendingChanges.secrets.find((c) => c.secretKey === secretName)?.id;

  const savePendingRow = async (knownPendingChangeId?: string) => {
    if (!onPendingSave) return;
    const pendingChangeId = knownPendingChangeId ?? findPendingChangeId();
    if (batchAutoApplyTimer.current) {
      clearTimeout(batchAutoApplyTimer.current);
      if (!knownPendingChangeId) applyBatchEditsRef.current?.();
    }
    setIsSavingPendingChange.on();
    try {
      await onPendingSave(environment, secretName, pendingChangeId);
    } finally {
      setIsSavingPendingChange.off();
    }
  };

  // Reset form when a pending change is externally discarded or saved (e.g. CommitForm discard
  // button or this row's inline save).
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
    const flow = {
      action: "copy" as const,
      resourceType: "secret" as const,
      source: "row" as const,
      destination: "clipboard" as const,
      countBucket: "1" as const,
      provenance:
        isPendingCreate || (isBatchMode && hasPendingValueChange)
          ? ("pending" as const)
          : ("committed" as const)
    };
    const attempt = telemetry.startFlow(flow);
    try {
      if (isPendingCreate || (isBatchMode && hasPendingValueChange)) {
        // In batch mode with a queued value change, copy the pending value shown in the field
        // rather than refetching the (stale) committed server value.
        await window.navigator.clipboard.writeText((watchedValue as string) ?? "");
      } else {
        const { data } = await refetchSharedValue();
        await window.navigator.clipboard.writeText(data?.value ?? "");
      }
      attempt.flow({ ...flow, phase: "clipboard-written" });
      setIsCopied(true);
      createNotification({ type: "success", text: "Copied secret to clipboard" });
    } catch (e) {
      attempt.flow({ ...flow, phase: "failed" });
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
      if (batchAutoApplyTimer.current) {
        clearTimeout(batchAutoApplyTimer.current);
        applyBatchEditsRef.current?.();
      }
      const pendingChangeId = findPendingChangeId() ?? secretId;
      await onSecretUpdate({
        env: environment,
        key: secretName,
        value: undefined,
        secretValueHidden,
        type: SecretType.Shared,
        secretId,
        skipMultilineEncoding: !skipMultilineEncoding
      });
      await savePendingRow(pendingChangeId);
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

  const resetSheetFields = (changes: TSecretEditChanges) => {
    if (changes.value !== undefined) {
      lastAppliedRef.current.value = changes.value;
      resetField("value", {
        defaultValue: !isBatchMode && secretValueHidden ? defaultValue || null : changes.value
      });
    }
    if (changes.secretComment !== undefined) {
      lastAppliedRef.current.comment = changes.secretComment;
      setValue("comment", changes.secretComment);
    }
    if (changes.tags !== undefined) {
      lastAppliedRef.current.tags = changes.tags;
      setValue("tags", changes.tags);
    }
    if (changes.secretMetadata !== undefined) {
      const metadata = changes.secretMetadata.map((entry) => ({
        ...entry,
        isEncrypted: entry.isEncrypted ?? false
      }));
      lastAppliedRef.current.metadata = metadata;
      setValue("metadata", metadata);
    }
  };

  const handleFormSubmit = async ({
    value,
    key,
    sheetChanges
  }: {
    value?: string | null;
    key?: string;
    sheetChanges?: TSecretEditChanges;
  }) => {
    const invocation = valueSheetFlow.current;
    const isValueDirty = sheetChanges
      ? sheetChanges.value !== undefined
      : getFieldState("value").isDirty;
    const isKeyDirty = !sheetChanges && isSingleEnvView && key && key !== secretName;

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
      handlePopUpOpen("editSecret", {
        secretValue: value,
        newKey: isKeyDirty ? key : undefined,
        sheetChanges
      });
      return false;
    }

    // Handle rename and/or value changes in a single mutation
    if ((sheetChanges || isKeyDirty || isValueDirty) && secretName) {
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
          newSecretName: isKeyDirty ? key : undefined,
          ...sheetChanges
        });
      }
    }
    if (invocation !== valueSheetFlow.current) return false;
    // Update originalValueRef so batch mode auto-apply doesn't see stale data
    // after an atomic save. Only for non-hidden secrets since hidden secrets
    // never fetch sharedValueData.
    if (isValueDirty && !secretValueHidden) {
      originalValueRef.current = value ?? null;
    }
    if (sheetChanges) {
      resetSheetFields(sheetChanges);
      return true;
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
    return true;
  };

  const submitForm = handleSubmit(handleFormSubmit);
  const isDirtyState = Boolean(
    isDirty && (dirtyFields.key || dirtyFields.value) && !isImportedSecret && !isBatchMode
  );

  const handleEditSecret = async ({
    secretValue,
    newKey,
    sheetChanges
  }: {
    secretValue: string;
    newKey?: string;
    sheetChanges?: TSecretEditChanges;
  }) => {
    if (isEditing) return;
    const invocation = valueSheetFlow.current;
    const confirmation = editConfirmation.current;
    setIsEditing.on();
    try {
      const pendingChangeId = findPendingChangeId() ?? secretId;
      await onSecretUpdate({
        env: environment,
        key: secretName,
        value: secretValue,
        secretValueHidden,
        type: SecretType.Shared,
        secretId,
        newSecretName: newKey,
        ...sheetChanges
      });
      if (isBatchMode) await savePendingRow(pendingChangeId);
      if (invocation !== valueSheetFlow.current || confirmation !== editConfirmation.current)
        return;
      if (!secretValueHidden) {
        originalValueRef.current = secretValue;
      }
      if (sheetChanges) {
        resetSheetFields(sheetChanges);
        closeValueSheet(invocation);
      } else {
        reset({
          value: secretValue,
          ...(isSingleEnvView ? { key: newKey || secretName } : {})
        });
      }
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
  const handleEditShortcut = useSecretInputActionShortcuts({
    isActive: isBatchMode ? isPendingBatchChange || isDirty : isDirtyState,
    isDisabled: isSubmitting || isSavingPendingChange,
    isSaveDisabled: isCreatable || isPendingCreate ? !canCreate : !canEditSecretValue,
    onSave: isBatchMode ? savePendingRow : submitForm,
    onUndo: handleFormReset
  });
  // personal overrides are only visible to their owner, so describe access on the secret suffices to manage them
  const canCreatePersonalOverride = hasSecretReadValueOrDescribePermission(
    permission,
    ProjectPermissionSecretActions.DescribeSecret,
    { environment, secretPath, secretName, secretTags: ["*"] }
  );
  const canDuplicateSecret = hasSecretReadValueOrDescribePermission(
    permission,
    ProjectPermissionSecretActions.DescribeSecret,
    { environment, secretPath, secretName, secretTags: tags?.map(({ slug }) => slug) ?? [] }
  );

  const isReadOnly =
    isPendingDelete ||
    isImportedSecret ||
    isManagedSecret ||
    isFetchingSharedValue ||
    isErrorFetchingSharedValue ||
    (isCreatable ? !canCreate : !canEditSecretValue);

  const isValueSheetReadOnly =
    isPendingDelete ||
    isImportedSecret ||
    isManagedSecret ||
    !canEditSecretValue ||
    Boolean(revokedProjectFolderGrant);

  const handleOpenValueSheet = async () => {
    if (isValueSheetReadOnly || isLoadingEditValue) return;
    const owner = {};
    valueSheetOwner.current = owner;
    const pendingValue =
      hasPendingValueChange || getFieldState("value").isDirty || isPendingCreate
        ? ((watchedValue as string) ?? "")
        : undefined;
    if (secretValueHidden || isEmpty || isPendingCreate) {
      valueSheetFlow.current = telemetry.openFlow({
        action: "update",
        resourceType: "secret",
        source: "row"
      });
      setValueEditDraft({ value: pendingValue ?? "", scope: valueEditScope });
      return;
    }
    setIsLoadingEditValue(true);
    try {
      const { data, error } = await refetchSharedValue();
      if (owner !== valueSheetOwner.current) return;
      if (error || !data) {
        createNotification({
          type: "error",
          text: "Failed to fetch secret value. Please try again."
        });
        return;
      }
      valueSheetFlow.current = telemetry.openFlow({
        action: "update",
        resourceType: "secret",
        source: "row"
      });
      setValueEditDraft({ value: pendingValue ?? data.value ?? "", scope: valueEditScope });
    } finally {
      setIsLoadingEditValue(false);
    }
  };

  const handleValueSheetSubmit = async (changes: TSecretEditChanges) => {
    const invocation = valueSheetFlow.current;
    if (isValueSheetReadOnly || valueEditDraft?.scope !== valueEditScope) return;
    if (isBatchMode) {
      if (batchAutoApplyTimer.current) {
        clearTimeout(batchAutoApplyTimer.current);
        applyBatchEditsRef.current?.();
      }
      const pendingChangeId = findPendingChangeId() ?? secretId;
      await onSecretUpdate({
        env: environment,
        key: secretName,
        value: changes.value,
        secretValueHidden,
        type: SecretType.Shared,
        secretId,
        originalValue: originalValueRef.current ?? undefined,
        ...changes
      });
      if (invocation !== valueSheetFlow.current) return;
      resetSheetFields(changes);
      await savePendingRow(pendingChangeId);
    } else {
      const completed = await handleFormSubmit({ value: changes.value, sheetChanges: changes });
      if (!completed) return;
    }
    closeValueSheet(invocation);
  };

  const shouldStayExpanded =
    isCommentOpen || isTagOpen || isMetadataOpen || isReminderOpen || isDropdownOpen;

  const [actionBarWidth, setActionBarWidth] = useState(0);
  const actionBarResizeObserverRef = useRef<ResizeObserver | null>(null);
  const actionBarRef = useCallback((node: HTMLDivElement | null) => {
    actionBarResizeObserverRef.current?.disconnect();
    actionBarResizeObserverRef.current = null;
    if (!node) {
      setActionBarWidth(0);
      return;
    }
    const observer = new ResizeObserver(() => setActionBarWidth(node.offsetWidth));
    observer.observe(node);
    actionBarResizeObserverRef.current = observer;
  }, []);

  const isEditValueDisabled =
    isPendingDelete ||
    isImportedSecret ||
    isManagedSecret ||
    isLoadingEditValue ||
    Boolean(revokedProjectFolderGrant) ||
    (isCreatable ? !canCreate : !canEditSecretValue);

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
        <Tooltip
          delayDuration={1000}
          skipDelayDuration={0}
          open={isFieldFocused || !field.value ? false : undefined}
        >
          <TooltipTrigger asChild>
            <Input
              autoComplete="off"
              readOnly={
                isPendingDelete || isImportedSecret || isManagedSecret || !canEditSecretValue
              }
              placeholder="Secret name"
              isError={Boolean(error)}
              {...field}
              value={field.value ?? ""}
              className={twMerge(
                "field-sizing-content h-auto w-auto max-w-full truncate rounded-none border-0 bg-transparent px-0 py-0 text-foreground shadow-none focus-visible:border-transparent focus-visible:ring-0",
                isPendingDelete && "text-danger/75 line-through"
              )}
              onChange={(event) => {
                const value = currentProject?.autoCapitalization
                  ? event.currentTarget.value.toUpperCase()
                  : event.currentTarget.value;
                field.onChange(value);
              }}
              onFocus={() => setIsFieldFocused.on()}
              onKeyDown={handleEditShortcut}
              onScroll={(e) => {
                if (document.activeElement !== e.currentTarget) e.currentTarget.scrollLeft = 0;
              }}
              onBlur={(e) => {
                e.currentTarget.scrollLeft = 0;
                field.onBlur();
                if (!isBatchMode && field.onChange) field.onChange(e);
                setIsFieldFocused.off();
              }}
            />
          </TooltipTrigger>
          <TooltipContent className="max-w-(--radix-tooltip-content-available-width) break-all whitespace-normal">
            {field.value ?? secretName}
          </TooltipContent>
        </Tooltip>
      )}
    />
  ) : null;

  const secretHasReference = hasSecretReference(watchedValue as string);
  const handleAnnotationEscapeKeyDown = (event: KeyboardEvent) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.matches('[role="combobox"][aria-expanded="true"]')
    ) {
      event.preventDefault();
    }
  };

  const lockCommentSide = (handle: HTMLElement) => {
    if (commentSide) return;
    const side = handle.closest("[data-side]")?.getAttribute("data-side");
    setCommentSide(side === "top" || side === "left" || side === "right" ? side : "bottom");
  };

  const commentPopoverContent = (
    <PopoverContent
      onCloseAutoFocus={(e) => e.preventDefault()}
      className="w-80"
      align="end"
      side={commentSide ?? "bottom"}
      avoidCollisions={!commentSide}
      style={{ translate: `${commentDragOffset.x}px ${commentDragOffset.y}px` }}
    >
      <SecretCommentForm
        dragHandleProps={{
          onPointerDown: (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            lockCommentSide(e.currentTarget);
            commentDragStart.current = {
              pointerX: e.clientX,
              pointerY: e.clientY,
              ...commentDragOffset
            };
          },
          onPointerMove: (e) => {
            const start = commentDragStart.current;
            if (!start) return;
            setCommentDragOffset({
              x: start.x + e.clientX - start.pointerX,
              y: start.y + e.clientY - start.pointerY
            });
          },
          onPointerUp: () => {
            commentDragStart.current = undefined;
          },
          onLostPointerCapture: () => {
            commentDragStart.current = undefined;
          },
          onKeyDown: (e) => {
            const step = e.shiftKey ? 64 : 16;
            const deltas: Record<string, { x: number; y: number } | undefined> = {
              ArrowLeft: { x: -step, y: 0 },
              ArrowRight: { x: step, y: 0 },
              ArrowUp: { x: 0, y: -step },
              ArrowDown: { x: 0, y: step }
            };
            const delta = deltas[e.key];
            if (!delta) return;
            e.preventDefault();
            lockCommentSide(e.currentTarget);
            setCommentDragOffset((prev) => ({ x: prev.x + delta.x, y: prev.y + delta.y }));
          }
        }}
        comment={isBatchMode ? ((watchedComment as string) ?? comment) : comment}
        secretKey={secretName}
        secretPath={secretPath}
        environment={environment}
        onClose={() => setIsCommentOpen(false)}
        isBatchMode={isBatchMode}
        onCommentChange={handleCommentChange}
      />
    </PopoverContent>
  );
  const commentPreview = isBatchMode ? ((watchedComment as string) ?? comment) : comment;
  const canDescribeSecret = hasSecretReadValueOrDescribePermission(
    permission,
    ProjectPermissionSecretActions.DescribeSecret,
    { environment, secretPath, secretName, secretTags: tags?.map(({ slug }) => slug) ?? [] }
  );
  const showCommentPreview =
    commentPreview && !isImportedSecret && !revokedProjectFolderGrant && canDescribeSecret;

  const valueContent = (
    <>
      <ConfirmationAlertDialog
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        title={`Are you sure you want to delete ${secretName}?`}
        description="This will permanently remove the secret from this environment. This action cannot be undone."
        confirmKey={secretName}
        confirmLabel="Delete Secret"
        isPending={isDeleting}
        onConfirm={handleDeleteSecret}
      />

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
            "relative grow pr-2",
            isFieldActive && !isBatchMode && "pr-16",
            isFieldActive && isBatchMode && "pr-6"
          )}
          style={isFieldActive && actionBarWidth ? { paddingRight: actionBarWidth } : undefined}
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
                variant="plain"
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
                onKeyDown={handleEditShortcut}
              />
            )}
          />
        </div>
        {!isDirtyState && !isFieldActive && (
          <div className="pointer-events-none flex w-fit items-start justify-end self-start pl-2 opacity-0 transition-opacity duration-300 motion-reduce:transition-none [@media(hover:hover)]:pointer-events-auto [@media(hover:hover)]:opacity-100 [@media(hover:hover)]:group-focus-within:pointer-events-none [@media(hover:hover)]:group-focus-within:opacity-0 [@media(hover:hover)]:group-hover:pointer-events-none [@media(hover:hover)]:group-hover:opacity-0">
            <div className="flex items-center gap-1">
              {!isSingleEnvView && comment && !isImportedSecret && (
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
        {revokedProjectFolderGrant && !isDirtyState && (
          <div
            className={twMerge(
              "ml-auto flex shrink-0 items-center",
              isSingleEnvView &&
                "mr-16 transition-[margin] duration-300 motion-reduce:transition-none [@media(hover:hover)]:mr-0 [@media(hover:hover)]:group-focus-within:mr-16 [@media(hover:hover)]:group-hover:mr-16",
              isSingleEnvView && isFieldActive && "mr-8"
            )}
          >
            <Badge variant="danger">
              <BanIcon className="size-3.5" />
              Secret share revoked
            </Badge>
          </div>
        )}
      </div>
      {isDirtyState && (
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
            <SecretInputActions
              className={twMerge(
                "absolute z-20 px-0.5 py-0.5",
                isSingleEnvView ? "top-1 right-1" : "top-[0.25px] -right-1.5"
              )}
              isSaveDisabled={isSubmitting || !isAllowed}
              isUndoDisabled={isSubmitting}
              onSave={submitForm}
              onUndo={handleFormReset}
            />
          )}
        </ProjectPermissionCan>
      )}
      {!(
        isDirty &&
        (dirtyFields.key || dirtyFields.value) &&
        !isImportedSecret &&
        !isBatchMode
      ) && (
        <div
          ref={actionBarRef}
          data-table-row-filter-positioner
          className={twMerge(
            "absolute z-20",
            "flex items-center gap-0.5 rounded-md border border-border bg-container-hover px-0.5 py-0.5 shadow-md",
            TABLE_ROW_ACTION_BAR_VISIBILITY_CLASS_NAME,
            shouldStayExpanded && TABLE_ROW_ACTION_BAR_FORCE_VISIBLE_CLASS_NAME,
            isSingleEnvView ? "top-[3px] right-0.5" : "-top-px -right-1.5"
          )}
        >
          {!isSingleEnvView && (
            <Popover open={isCommentOpen} onOpenChange={setIsCommentOpen}>
              <PopoverAnchor asChild>
                <span className="pointer-events-none absolute inset-0" />
              </PopoverAnchor>
              {commentPopoverContent}
            </Popover>
          )}
          <Popover modal open={isTagOpen} onOpenChange={setIsTagOpen}>
            <PopoverAnchor asChild>
              <span className="pointer-events-none absolute inset-0" />
            </PopoverAnchor>
            <PopoverContent
              onCloseAutoFocus={(e) => e.preventDefault()}
              onEscapeKeyDown={handleAnnotationEscapeKeyDown}
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
          <Sheet open={isReminderOpen} onOpenChange={setIsReminderOpen}>
            <SheetContent className="flex h-full max-h-full flex-col gap-y-0">
              <SheetHeader className="border-b">
                <SheetTitle>{reminder ? "Edit Reminder" : "Add Reminder"}</SheetTitle>
                <SheetDescription>
                  Notify the channels below when {secretName} in {environmentName} is due for
                  rotation.
                </SheetDescription>
              </SheetHeader>
              {secretId && isReminderOpen && (
                <SecretReminderForm
                  secretId={secretId}
                  secretKey={secretName}
                  secretPath={secretPath}
                  environment={environment}
                  reminder={reminder}
                  onClose={() => setIsReminderOpen(false)}
                />
              )}
            </SheetContent>
          </Sheet>
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
          {isPendingBatchChange && onPendingSave && (
            <ProjectPermissionCan
              I={
                isPendingCreate
                  ? ProjectPermissionActions.Create
                  : isPendingDelete
                    ? ProjectPermissionActions.Delete
                    : ProjectPermissionActions.Edit
              }
              a={subject(ProjectPermissionSub.Secrets, {
                environment,
                secretPath,
                secretName,
                secretTags: ["*"]
              })}
            >
              {(isAllowed) => (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      aria-label="Save pending secret changes"
                      variant="ghost"
                      className="size-7 border-0 hover:text-success"
                      size="xs"
                      isDisabled={!isAllowed || isSavingPendingChange}
                      onClick={() => savePendingRow()}
                    >
                      <SaveIcon />
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent>Save pending changes</TooltipContent>
                </Tooltip>
              )}
            </ProjectPermissionCan>
          )}
          {isPendingBatchChange && (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label="Discard pending secret changes"
                  variant="ghost"
                  className="size-7 border-0 hover:text-danger"
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
            !!(
              (!isSingleEnvView && comment) ||
              (canReadTags && tags?.length) ||
              reminder ||
              secretMetadata?.length
            ) && (
              <>
                {!isSingleEnvView && comment && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        aria-label="View secret comment"
                        variant="ghost"
                        size="xs"
                        className="size-7 border-0"
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
                        aria-label="View secret tags"
                        variant="ghost"
                        size="xs"
                        className="size-7 border-0"
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
                        aria-label="View secret reminder"
                        variant="ghost"
                        size="xs"
                        className="size-7 border-0"
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
                        aria-label="View secret metadata"
                        variant="ghost"
                        size="xs"
                        className="size-7 border-0"
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
              <span
                className="inline-flex"
                {...(isEditValueDisabled && {
                  role: "button",
                  tabIndex: 0,
                  "aria-disabled": true,
                  "aria-label": "Edit secret value"
                })}
              >
                <IconButton
                  aria-label="Edit secret value"
                  variant="ghost"
                  size="xs"
                  className="size-7 border-0"
                  isDisabled={isEditValueDisabled}
                  onClick={() => {
                    if (isSingleEnvView && !isCreatable && !isOverride) {
                      handleOpenValueSheet();
                      return;
                    }
                    setFocus("value", { shouldSelect: true });
                  }}
                >
                  <EditIcon className="size-3.5" />
                </IconButton>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {isPendingDelete
                ? "Discard Pending Changes First"
                : isImportedSecret
                  ? "Cannot Edit Imported Secret"
                  : isHoneyTokenSecret
                    ? "Honey token secrets are managed by Infisical and can't be edited"
                    : isRotatedSecret
                      ? "Rotated secrets are managed by their secret rotation and can't be edited"
                      : revokedProjectFolderGrant
                        ? "This secret share was revoked, so it can't be edited"
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
                aria-label="Copy secret value"
                variant="ghost"
                size="xs"
                className="size-7 border-0"
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
                    aria-label="More secret actions"
                    variant="ghost"
                    size="xs"
                    className="size-7 border-0"
                  >
                    <EllipsisIcon />
                  </IconButton>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Secret Actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align="end"
              className="min-w-[200px] [&_[data-variant=default]]:text-foreground [&_svg:not([class*='size-'])]:!size-3"
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
                    "px-2.5 py-1.5",
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
                    className="px-2.5 py-1.5"
                    onClick={() => setPendingAnnotation("comment")}
                  >
                    <MessageSquareIcon className={twMerge(comment && "text-project")} />
                    {comment ? "View Comment" : "Add Comment"}
                  </DropdownMenuItem>
                  <Tooltip open={!canReadTags ? undefined : false}>
                    <TooltipTrigger className="block w-full">
                      <DropdownMenuItem
                        className="px-2.5 py-1.5"
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
                  <Tooltip open={!secretId || isPendingCreate ? undefined : false}>
                    <TooltipTrigger className="block w-full">
                      <DropdownMenuItem
                        className="px-2.5 py-1.5"
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
                    className="px-2.5 py-1.5"
                    onClick={() => setPendingAnnotation("metadata")}
                  >
                    <CodeXmlIcon className={twMerge(secretMetadata?.length && "text-project")} />
                    {secretMetadata?.length ? "View Metadata" : "Add Metadata"}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <div className="my-1" />
              <DropdownMenuLabel className="px-2.5 py-0.5 text-[10px]">Insights</DropdownMenuLabel>
              <Tooltip open={!canReadSecretValue || !secretId || isEmpty ? undefined : false}>
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem
                    className="px-2.5 py-1.5"
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
                  >
                    <TooltipTrigger className="block w-full">
                      <DropdownMenuItem
                        className="px-2.5 py-1.5"
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
              >
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem
                    className="px-2.5 py-1.5"
                    onClick={() => {
                      if (!subscription?.secretAccessInsights) {
                        onAccessInsightsUpgrade(() => setIsAccessInsightsOpen(true));
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
                    className="px-2.5 py-1.5"
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
              <Tooltip
                open={
                  isPendingBatchChange ||
                  isCreatable ||
                  isImportedSecret ||
                  isOverride ||
                  !canCreatePersonalOverride
                    ? undefined
                    : false
                }
              >
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem
                    className="px-2.5 py-1.5"
                    onClick={() => onAddOverride?.()}
                    isDisabled={
                      isPendingBatchChange ||
                      isCreatable ||
                      isImportedSecret ||
                      isOverride ||
                      !canCreatePersonalOverride
                    }
                  >
                    <GitBranchIcon />
                    Add Override
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {isPendingBatchChange
                    ? "Discard Pending Changes First"
                    : !canCreatePersonalOverride
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
              <Tooltip
                open={
                  isPendingBatchChange ||
                  !currentProject.secretSharing ||
                  secretValueHidden ||
                  (isCreatable && !isImportedSecret)
                    ? undefined
                    : false
                }
              >
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem
                    className="px-2.5 py-1.5"
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
                open={
                  isPendingBatchChange || isManagedSecret || isCreatable || !canDuplicateSecret
                    ? undefined
                    : false
                }
              >
                <TooltipTrigger className="block w-full">
                  <DropdownMenuItem
                    className="px-2.5 py-1.5"
                    onClick={onCopySecret}
                    isDisabled={
                      isPendingBatchChange ||
                      isManagedSecret ||
                      isCreatable ||
                      !canDuplicateSecret ||
                      !secretId ||
                      !onCopySecret
                    }
                  >
                    <CopyPlus />
                    Copy Secret
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {isPendingBatchChange
                    ? "Discard Pending Changes First"
                    : !canDuplicateSecret
                      ? "Access Denied"
                      : isCreatable
                        ? "Create Secret First"
                        : isHoneyTokenSecret
                          ? "Cannot Copy Honey Token Secret"
                          : isRotatedSecret
                            ? "Cannot Copy Rotated Secret"
                            : "Copy Secret"}
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
                  >
                    <TooltipTrigger className="block w-full">
                      <DropdownMenuItem
                        className="px-2.5 py-1.5"
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
      <Dialog open={isSecretReferenceOpen} onOpenChange={setIsSecretReferenceOpen}>
        <DialogContent className="max-w-3xl" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Secret Reference Details</DialogTitle>
            <DialogDescription>
              Visual breakdown of secrets referenced by this secret.
            </DialogDescription>
          </DialogHeader>
          <SecretReferenceTree
            secretPath={secretPath}
            environment={environment}
            secretKey={secretName}
            onClose={() => setIsSecretReferenceOpen(false)}
          />
        </DialogContent>
      </Dialog>
      <Sheet
        open={valueEditDraft?.scope === valueEditScope}
        onOpenChange={(open) => {
          if (!open) requestDiscard();
        }}
      >
        <SheetContent
          side="right"
          className="gap-y-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.target as HTMLElement)
              .querySelector<HTMLTextAreaElement>('[aria-label="secret value"]')
              ?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>Edit Secret</SheetTitle>
            <SheetDescription>Update this secret in {environmentName}.</SheetDescription>
          </SheetHeader>
          {valueEditDraft?.scope === valueEditScope && (
            <CreateSecretForm
              secretPath={secretPath}
              defaultSelectedEnvs={[{ name: environmentName, slug: environment }]}
              onClose={requestDiscard}
              isBatchMode={isBatchMode}
              editSecret={{
                key: pendingKeyName || secretName,
                value: valueEditDraft.value,
                comment: isBatchMode ? ((watchedComment as string) ?? comment) : comment,
                tags: isBatchMode ? watchedTags : tags,
                metadata: isBatchMode ? watchedMetadata : secretMetadata,
                skipMultilineEncoding,
                canEditButNotView: secretValueHidden,
                isReadOnly: isValueSheetReadOnly,
                onDirtyChange: setIsValueEditDirty,
                onSubmit: handleValueSheetSubmit
              }}
            />
          )}
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your unsaved changes to this secret will be lost."
      />
      <Sheet open={isVersionHistoryOpen} onOpenChange={setIsVersionHistoryOpen}>
        <SheetContent onOpenAutoFocus={(e) => e.preventDefault()} className="gap-y-0" side="right">
          <SheetHeader>
            <SheetTitle>Version History</SheetTitle>
            <SheetDescription>Audit secret history and rollback changes</SheetDescription>
          </SheetHeader>
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
      <AlertDialog
        isPending={isEditing}
        open={popUp.editSecret.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editSecret", isOpen)}
        confirmationValue="confirm"
      >
        <AlertDialogContent className="max-w-3xl [&>*]:min-w-0">
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
          <AlertDialogConfirmationField />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="project"
              onClick={(e) => {
                e.preventDefault();
                handleEditSecret(popUp?.editSecret?.data);
              }}
            >
              Save Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AddShareSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
    </>
  );

  if (isSingleEnvView) {
    return (
      <>
        <TableCell
          isTruncatable
          className={twMerge(
            "cursor-text border-r",
            isOverride && "border-l border-b-border/50 border-l-override"
          )}
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (!event.currentTarget.contains(target) || target.closest("input, button")) return;
            event.currentTarget.querySelector("input")?.focus();
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Popover open={isCommentOpen} onOpenChange={setIsCommentOpen}>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {showCommentPreview ? (
                  nameInput
                ) : (
                  <PopoverAnchor asChild>
                    <span className="inline-flex min-w-0">{nameInput}</span>
                  </PopoverAnchor>
                )}
                {showCommentPreview && (
                  <PopoverAnchor asChild>
                    <span className="inline-flex shrink-0">
                      <Tooltip open={isCommentOpen ? false : undefined}>
                        <TooltipTrigger asChild>
                          <IconButton
                            aria-label="View secret comment"
                            variant="ghost-muted"
                            size="2xs"
                            onClick={() => {
                              if (!isPendingDelete) setIsCommentOpen(true);
                            }}
                          >
                            <MessageSquareIcon />
                          </IconButton>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-72">
                          <p className="line-clamp-2 break-words whitespace-pre-wrap">
                            {commentPreview}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  </PopoverAnchor>
                )}
              </div>
              {commentPopoverContent}
            </Popover>
            <SecretLastEditedTime secret={lastEdited} field={timestampField} />
          </div>
        </TableCell>
        <TableCell
          className={twMerge("relative w-full max-w-0", isOverride && "border-b-border/50")}
        >
          <div data-table-row-filter-contents className="flex w-full flex-col gap-y-2 !filter-none">
            {valueContent}
          </div>
        </TableCell>
      </>
    );
  }

  return (
    <div
      data-table-row-filter-contents
      className="relative flex w-full flex-col gap-y-2 py-1.5 !filter-none"
    >
      {valueContent}
    </div>
  );
};
