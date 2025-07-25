/* eslint-disable no-nested-ternary */
/* eslint-disable simple-import-sort/imports */
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Checkbox,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  FontAwesomeSymbol,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  ModalTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SecretInput,
  Spinner,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import { WsTag } from "@app/hooks/api/types";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useCallback, useEffect, useRef } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { twMerge } from "tailwind-merge";
import {
  hasSecretReference,
  SecretReferenceTree
} from "@app/components/secrets/SecretReferenceDetails";

import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEyeSlash, faKey, faRotate } from "@fortawesome/free-solid-svg-icons";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import {
  FontAwesomeSpriteName,
  formSchema,
  SecretActionType,
  TFormSchema
} from "./SecretListView.utils";
import { CollapsibleSecretImports } from "./CollapsibleSecretImports";
import { useBatchModeActions } from "../../SecretMainPage.store";

export const HIDDEN_SECRET_VALUE = "******";
export const HIDDEN_SECRET_VALUE_API_MASK = "<hidden-by-infisical>";

type Props = {
  secret: SecretV3RawSanitized;
  onSaveSecret: (
    orgSec: SecretV3RawSanitized,
    modSec: Omit<SecretV3RawSanitized, "tags"> & { tags?: { id: string }[] },
    cb?: () => void
  ) => Promise<void>;
  onDeleteSecret: (sec: SecretV3RawSanitized) => void;
  onDetailViewSecret: (sec: SecretV3RawSanitized) => void;
  isVisible?: boolean;
  isSelected?: boolean;
  onToggleSecretSelect: (secret: SecretV3RawSanitized) => void;
  tags: WsTag[];
  onCreateTag: () => void;
  environment: string;
  secretPath: string;
  handleSecretShare: () => void;
  importedBy?: {
    environment: { name: string; slug: string };
    folders: {
      name: string;
      secrets?: { secretId: string; referencedSecretKey: string; referencedSecretEnv: string }[];
      isImported: boolean;
    }[];
  }[];
  isPending?: boolean;
  pendingAction?: PendingAction;
  colWidth: number;
};

export const SecretItem = memo(
  ({
    secret,
    onSaveSecret,
    onDeleteSecret,
    onDetailViewSecret,
    isVisible,
    isSelected,
    tags = [],
    onCreateTag,
    onToggleSecretSelect,
    environment,
    secretPath,
    handleSecretShare,
    importedBy,
    isPending,
    pendingAction,
    colWidth
  }: Props) => {
    const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
      "editSecret"
    ] as const);
    const { currentWorkspace } = useWorkspace();
    const { permission } = useProjectPermission();
    const { isRotatedSecret } = secret;
    const { removePendingChange } = useBatchModeActions();

    const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
    const isAutoSavingRef = useRef(false);

    const handleDeletePending = (pendingSecret: SecretV3RawSanitized) => {
      removePendingChange(pendingSecret.id, "secret", {
        workspaceId: currentWorkspace.id,
        environment,
        secretPath
      });
    };

    const canEditSecretValue = permission.can(
      ProjectPermissionSecretActions.Edit,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath,
        secretName: secret.key,
        secretTags: ["*"]
      })
    );

    const getDefaultValue = () => {
      if (secret.secretValueHidden) {
        return canEditSecretValue ? HIDDEN_SECRET_VALUE : "";
      }
      return secret.valueOverride || secret.value || "";
    };

    const {
      handleSubmit,
      control,
      register,
      watch,
      setValue,
      reset,
      getValues,
      trigger,
      formState: { isDirty, isSubmitting, errors }
    } = useForm<TFormSchema>({
      defaultValues: {
        ...secret,
        value: getDefaultValue()
      },
      values: {
        ...secret,
        value: getDefaultValue()
      },
      resolver: zodResolver(formSchema)
    });

    const secretName = watch("key");
    const overrideAction = watch("overrideAction");
    const hasComment = Boolean(watch("comment"));

    const selectedTags = watch("tags", []) || [];
    const selectedTagsGroupById = selectedTags.reduce<Record<string, boolean>>(
      (prev, curr) => ({ ...prev, [curr.id]: true }),
      {}
    );
    const selectedTagSlugs = selectedTags.map((i) => i.slug);

    const { fields, append, remove } = useFieldArray({
      control,
      name: "tags"
    });

    const isOverriden =
      overrideAction === SecretActionType.Created || overrideAction === SecretActionType.Modified;
    const hasTagsApplied = Boolean(fields.length);

    const autoSaveChanges = useCallback(
      async (data: TFormSchema) => {
        if (isAutoSavingRef.current) return;
        if (
          data.overrideAction === SecretActionType.Created ||
          data.overrideAction === SecretActionType.Modified
        ) {
          return;
        }

        isAutoSavingRef.current = true;
        try {
          await onSaveSecret(secret, { ...secret, ...data }, () => {
            reset();
          });
        } catch (error) {
          console.error("Auto-save failed:", error);
        } finally {
          isAutoSavingRef.current = false;
        }
      },
      [secret, onSaveSecret, importedBy, reset]
    );

    const formValues = watch();

    useEffect(() => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      if (isDirty && !isSubmitting && !isAutoSavingRef.current) {
        const debounceTime = 600;

        autoSaveTimeoutRef.current = setTimeout(() => {
          autoSaveChanges(formValues);
        }, debounceTime);
      }

      return () => {
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }
      };
    }, [formValues, isDirty, isSubmitting, autoSaveChanges, isPending]);

    const isReadOnly =
      hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.DescribeSecret,
        {
          environment,
          secretPath,
          secretName,
          secretTags: selectedTagSlugs
        }
      ) &&
      permission.cannot(
        ProjectPermissionSecretActions.Edit,
        subject(ProjectPermissionSub.Secrets, {
          environment,
          secretPath,
          secretName,
          secretTags: selectedTagSlugs
        })
      );

    const isReadOnlySecret =
      isReadOnly || isRotatedSecret || (isPending && pendingAction === PendingAction.Delete);

    const { secretValueHidden } = secret;

    const [isSecValueCopied, setIsSecValueCopied] = useToggle(false);
    useEffect(() => {
      let timer: NodeJS.Timeout;
      if (isSecValueCopied) {
        timer = setTimeout(() => setIsSecValueCopied.off(), 2000);
      }
      return () => clearTimeout(timer);
    }, [isSecValueCopied]);

    const handleOverrideClick = () => {
      if (isOverriden) {
        // override need not be flagged delete if it was never saved in server
        // meaning a new unsaved personal secret but user toggled back later
        const isUnsavedOverride = !secret.idOverride;
        setValue(
          "overrideAction",
          isUnsavedOverride ? secret?.overrideAction : SecretActionType.Deleted,
          {
            shouldDirty: !isUnsavedOverride
          }
        );
        setValue("valueOverride", secret?.valueOverride, { shouldDirty: !isUnsavedOverride });
        setValue("reminderRepeatDays", secret?.reminderRepeatDays, {
          shouldDirty: !isUnsavedOverride
        });
        setValue("reminderNote", secret?.reminderNote, { shouldDirty: !isUnsavedOverride });
      } else {
        reset();
        setValue("overrideAction", SecretActionType.Modified, { shouldDirty: true });
        setValue("valueOverride", "", { shouldDirty: true });
      }
    };

    const handleFormSubmit = async (data: TFormSchema) => {
      const hasDirectReferences = importedBy?.some(({ folders }) =>
        folders?.some(({ secrets }) =>
          secrets?.some(({ referencedSecretKey }) => referencedSecretKey === secret.key)
        )
      );

      if (hasDirectReferences) {
        handlePopUpOpen("editSecret", data);
        return;
      }
      await onSaveSecret(secret, { ...secret, ...data }, () => reset());
    };

    const handleEditSecret = async (data: TFormSchema) => {
      await onSaveSecret(secret, { ...secret, ...data }, () => reset());
      handlePopUpClose("editSecret");
    };

    const handleTagSelect = (tag: WsTag) => {
      if (selectedTagsGroupById?.[tag.id]) {
        const tagPos = selectedTags.findIndex(({ id }) => id === tag.id);
        if (tagPos !== -1) {
          remove(tagPos);
        }
      } else {
        append(tag);
      }
    };

    const copyTokenToClipboard = () => {
      const [overrideValue, value] = getValues(["value", "valueOverride"]);
      if (isOverriden) {
        navigator.clipboard.writeText(value as string);
      } else {
        navigator.clipboard.writeText(overrideValue as string);
      }
      setIsSecValueCopied.on();
    };

    const isInAutoSaveMode = isDirty && !isSubmitting && !isOverriden;

    return (
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <div
          className={twMerge(
            "border-b border-mineshaft-600 bg-mineshaft-800 shadow-none hover:bg-mineshaft-700",
            isDirty && "border-primary-400/50",
            isRotatedSecret && "bg-mineshaft-700/60",
            isPending && "bg-mineshaft-700/60",
            pendingAction === PendingAction.Delete && "border-l-2 border-l-red-600/75",
            pendingAction === PendingAction.Update && "border-l-2 border-l-yellow-600/75",
            pendingAction === PendingAction.Create && "border-l-2 border-l-green-600/75"
          )}
        >
          <div className="group flex">
            <div
              className={twMerge(
                "flex h-11 w-11 items-center justify-center px-4 py-3 text-mineshaft-300",
                isDirty && "text-primary",
                isPending && "ml-[-2px]"
              )}
            >
              {secret.isRotatedSecret ? (
                <div className="relative">
                  <FontAwesomeIcon icon={faKey} size="xs" className={twMerge("ml-3 h-3.5 w-3.5")} />
                  <FontAwesomeIcon
                    icon={faRotate}
                    size="xs"
                    className="absolute -bottom-[0.05rem] -right-[0.2rem] text-mineshaft-400"
                  />
                </div>
              ) : (
                <>
                  <Checkbox
                    id={`checkbox-${secret.id}`}
                    isChecked={isSelected}
                    onCheckedChange={() => onToggleSecretSelect(secret)}
                    className={twMerge("ml-3 hidden group-hover:flex", isSelected && "flex")}
                  />
                  <FontAwesomeSymbol
                    className={twMerge(
                      "ml-3 block h-3.5 w-3.5 group-hover:hidden",
                      isSelected && "hidden"
                    )}
                    symbolName={FontAwesomeSpriteName.SecretKey}
                  />
                </>
              )}
            </div>
            <div
              className="flex h-11 flex-shrink-0 items-center px-4 py-2"
              style={{ width: colWidth }}
            >
              <Controller
                name="key"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Input
                    autoComplete="off"
                    isReadOnly={isReadOnly || isRotatedSecret}
                    autoCapitalization={currentWorkspace?.autoCapitalization}
                    variant="plain"
                    isDisabled={isOverriden}
                    placeholder={error?.message}
                    isError={Boolean(error)}
                    onKeyUp={() => trigger("key")}
                    {...field}
                    className="w-full px-0 placeholder:text-red-500 focus:text-bunker-100 focus:ring-transparent"
                  />
                )}
              />
            </div>
            <div
              className="flex w-80 flex-grow items-center border-x border-mineshaft-600 py-1 pl-4 pr-2"
              tabIndex={0}
              role="button"
            >
              {secretValueHidden && !isOverriden && (
                <Tooltip
                  content={`You do not have access to view the current value${canEditSecretValue && !isRotatedSecret ? ", but you can set a new one" : "."}`}
                >
                  <FontAwesomeIcon className="pr-2" size="sm" icon={faEyeSlash} />
                </Tooltip>
              )}
              {isOverriden ? (
                <Controller
                  name="valueOverride"
                  key="value-overriden"
                  control={control}
                  render={({ field }) => (
                    <SecretInput
                      key="value-overriden"
                      isVisible={isVisible}
                      isReadOnly={isReadOnly}
                      {...field}
                      containerClassName="py-1.5 rounded-md transition-all"
                    />
                  )}
                />
              ) : (
                <Controller
                  name="value"
                  key="secret-value"
                  control={control}
                  render={({ field }) => (
                    <InfisicalSecretInput
                      isReadOnly={isReadOnlySecret}
                      key="secret-value"
                      isVisible={isVisible && !secretValueHidden}
                      canEditButNotView={secretValueHidden && !isOverriden}
                      environment={environment}
                      secretPath={secretPath}
                      {...field}
                      defaultValue={secretValueHidden ? HIDDEN_SECRET_VALUE : undefined}
                      containerClassName="py-1.5 rounded-md transition-all"
                    />
                  )}
                />
              )}
              {pendingAction !== PendingAction.Create && pendingAction !== PendingAction.Delete && (
                <div
                  key="actions"
                  className="flex h-full flex-shrink-0 self-start transition-all group-hover:gap-x-2"
                >
                  <Tooltip content="Copy secret">
                    <IconButton
                      isDisabled={secret.secretValueHidden}
                      ariaLabel="copy-value"
                      variant="plain"
                      size="sm"
                      className="w-0 overflow-hidden p-0 group-hover:w-5"
                      onClick={copyTokenToClipboard}
                    >
                      <FontAwesomeSymbol
                        className="h-3.5 w-3"
                        symbolName={
                          isSecValueCopied
                            ? FontAwesomeSpriteName.Check
                            : FontAwesomeSpriteName.ClipboardCopy
                        }
                      />
                    </IconButton>
                  </Tooltip>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Edit}
                    a={subject(ProjectPermissionSub.Secrets, {
                      environment,
                      secretPath,
                      secretName,
                      secretTags: selectedTagSlugs
                    })}
                  >
                    {(isAllowed) => (
                      <Modal>
                        <ModalTrigger asChild>
                          <IconButton
                            className="w-0 overflow-hidden p-0 group-hover:w-5"
                            variant="plain"
                            size="md"
                            ariaLabel="reference-tree"
                            isDisabled={!isAllowed || !hasSecretReference(secret?.value)}
                          >
                            <Tooltip
                              content={
                                hasSecretReference(secret?.value)
                                  ? "Secret Reference Tree"
                                  : "Secret does not contain references"
                              }
                            >
                              <FontAwesomeSymbol
                                className="h-3.5 w-3.5"
                                symbolName={FontAwesomeSpriteName.SecretReferenceTree}
                              />
                            </Tooltip>
                          </IconButton>
                        </ModalTrigger>
                        <ModalContent
                          title="Secret Reference Details"
                          subTitle="Visual breakdown of secrets referenced by this secret."
                          onOpenAutoFocus={(e) => e.preventDefault()}
                        >
                          <SecretReferenceTree
                            secretPath={secretPath}
                            environment={environment}
                            secretKey={secret?.key}
                          />
                        </ModalContent>
                      </Modal>
                    )}
                  </ProjectPermissionCan>
                  <DropdownMenu>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={subject(ProjectPermissionSub.Secrets, {
                        environment,
                        secretPath,
                        secretName,
                        secretTags: selectedTagSlugs
                      })}
                    >
                      {(isAllowed) => (
                        <DropdownMenuTrigger asChild disabled={!isAllowed}>
                          <IconButton
                            ariaLabel="tags"
                            variant="plain"
                            size="sm"
                            className={twMerge(
                              "w-0 overflow-hidden p-0 group-hover:w-5 data-[state=open]:w-5",
                              hasTagsApplied && "w-5 text-primary"
                            )}
                            isDisabled={!isAllowed}
                          >
                            <Tooltip content="Tags">
                              <FontAwesomeSymbol
                                className="h-3.5 w-3.5"
                                symbolName={FontAwesomeSpriteName.Tags}
                              />
                            </Tooltip>
                          </IconButton>
                        </DropdownMenuTrigger>
                      )}
                    </ProjectPermissionCan>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Add tags to this secret</DropdownMenuLabel>
                      {tags.map((tag) => {
                        const { id: tagId, slug, color } = tag;

                        const isTagSelected = selectedTagsGroupById?.[tagId];
                        return (
                          <DropdownMenuItem
                            onClick={() => handleTagSelect(tag)}
                            key={`${secret.id}-${tagId}`}
                            icon={
                              isTagSelected && (
                                <FontAwesomeSymbol
                                  symbolName={FontAwesomeSpriteName.CheckedCircle}
                                  className="h-3 w-3"
                                />
                              )
                            }
                            iconPos="right"
                          >
                            <div className="flex items-center">
                              <div
                                className="mr-2 h-2 w-2 rounded-full"
                                style={{ background: color || "#bec2c8" }}
                              />
                              {slug}
                            </div>
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuItem className="px-1.5" asChild>
                        <Button
                          size="xs"
                          className="w-full"
                          colorSchema="primary"
                          variant="outline_bg"
                          leftIcon={
                            <FontAwesomeSymbol
                              symbolName={FontAwesomeSpriteName.Tags}
                              className="h-3 w-3"
                            />
                          }
                          onClick={onCreateTag}
                        >
                          Create a tag
                        </Button>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Edit}
                    a={subject(ProjectPermissionSub.Secrets, {
                      environment,
                      secretPath,
                      secretName,
                      secretTags: selectedTagSlugs
                    })}
                    renderTooltip
                    allowedLabel="Override"
                  >
                    {(isAllowed) => (
                      <IconButton
                        ariaLabel="override-value"
                        isDisabled={!isAllowed}
                        variant="plain"
                        size="sm"
                        onClick={handleOverrideClick}
                        className={twMerge(
                          "w-0 overflow-hidden p-0 group-hover:w-5",
                          isOverriden && "w-5 text-primary"
                        )}
                      >
                        <FontAwesomeSymbol
                          symbolName={FontAwesomeSpriteName.Override}
                          className="h-3.5 w-3.5"
                        />
                      </IconButton>
                    )}
                  </ProjectPermissionCan>
                  <Popover>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={subject(ProjectPermissionSub.Secrets, {
                        environment,
                        secretPath,
                        secretName,
                        secretTags: selectedTagSlugs
                      })}
                    >
                      {(isAllowed) => (
                        <PopoverTrigger asChild disabled={!isAllowed}>
                          <IconButton
                            className={twMerge(
                              "w-0 overflow-hidden p-0 group-hover:w-5",
                              hasComment && "w-5 text-primary"
                            )}
                            variant="plain"
                            size="md"
                            ariaLabel="add-comment"
                            isDisabled={!isAllowed}
                          >
                            <Tooltip content="Comment">
                              <FontAwesomeSymbol
                                className="h-3.5 w-3.5"
                                symbolName={FontAwesomeSpriteName.Comment}
                              />
                            </Tooltip>
                          </IconButton>
                        </PopoverTrigger>
                      )}
                    </ProjectPermissionCan>
                    <IconButton
                      isDisabled={secret.secretValueHidden || !currentWorkspace.secretSharing}
                      className="w-0 overflow-hidden p-0 group-hover:w-5"
                      variant="plain"
                      size="md"
                      ariaLabel="share-secret"
                      onClick={handleSecretShare}
                    >
                      <Tooltip content="Share Secret">
                        <FontAwesomeSymbol
                          className="h-3.5 w-3.5"
                          symbolName={FontAwesomeSpriteName.ShareSecret}
                        />
                      </Tooltip>
                    </IconButton>
                    <PopoverContent
                      className="w-auto border border-mineshaft-600 bg-mineshaft-800 p-2 drop-shadow-2xl"
                      sticky="always"
                    >
                      <FormControl label="Comment" className="mb-0">
                        <TextArea
                          className="border border-mineshaft-600 text-sm"
                          rows={8}
                          cols={30}
                          {...register("comment")}
                        />
                      </FormControl>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              {pendingAction === PendingAction.Create && (
                <div
                  key="actions"
                  className="flex h-full flex-shrink-0 self-start transition-all group-hover:gap-x-2"
                >
                  <DropdownMenu>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={subject(ProjectPermissionSub.Secrets, {
                        environment,
                        secretPath,
                        secretName,
                        secretTags: selectedTagSlugs
                      })}
                    >
                      {(isAllowed) => (
                        <DropdownMenuTrigger asChild disabled={!isAllowed}>
                          <IconButton
                            ariaLabel="tags"
                            variant="plain"
                            size="sm"
                            className={twMerge(
                              "w-0 overflow-hidden p-0 group-hover:w-5 data-[state=open]:w-5",
                              hasTagsApplied && "w-5 text-primary"
                            )}
                            isDisabled={!isAllowed}
                          >
                            <Tooltip content="Tags">
                              <FontAwesomeSymbol
                                className="h-3.5 w-3.5"
                                symbolName={FontAwesomeSpriteName.Tags}
                              />
                            </Tooltip>
                          </IconButton>
                        </DropdownMenuTrigger>
                      )}
                    </ProjectPermissionCan>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Add tags to this secret</DropdownMenuLabel>
                      {tags.map((tag) => {
                        const { id: tagId, slug, color } = tag;

                        const isTagSelected = selectedTagsGroupById?.[tagId];
                        return (
                          <DropdownMenuItem
                            onClick={() => handleTagSelect(tag)}
                            key={`${secret.id}-${tagId}`}
                            icon={
                              isTagSelected && (
                                <FontAwesomeSymbol
                                  symbolName={FontAwesomeSpriteName.CheckedCircle}
                                  className="h-3 w-3"
                                />
                              )
                            }
                            iconPos="right"
                          >
                            <div className="flex items-center">
                              <div
                                className="mr-2 h-2 w-2 rounded-full"
                                style={{ background: color || "#bec2c8" }}
                              />
                              {slug}
                            </div>
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuItem className="px-1.5" asChild>
                        <Button
                          size="xs"
                          className="w-full"
                          colorSchema="primary"
                          variant="outline_bg"
                          leftIcon={
                            <FontAwesomeSymbol
                              symbolName={FontAwesomeSpriteName.Tags}
                              className="h-3 w-3"
                            />
                          }
                          onClick={onCreateTag}
                        >
                          Create a tag
                        </Button>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
            <AnimatePresence mode="wait">
              {isInAutoSaveMode ? (
                <motion.div
                  key="auto-save-mode"
                  className="flex w-[63px] flex-shrink-0 items-center justify-between px-3"
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -10, opacity: 0 }}
                >
                  <div className="h-10 w-12" />
                </motion.div>
              ) : !isDirty ? (
                isPending ? (
                  <motion.div
                    key="options"
                    className="flex w-[63px] flex-shrink-0 items-center justify-between px-3"
                    initial={{ x: 0, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 10, opacity: 0 }}
                  >
                    <Tooltip content="More">
                      <IconButton
                        ariaLabel="more"
                        variant="plain"
                        size="md"
                        className="h-5 w-4 p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => onDetailViewSecret(secret)}
                        isDisabled={pendingAction !== "update"}
                      >
                        <FontAwesomeSymbol
                          symbolName={FontAwesomeSpriteName.More}
                          className="h-5 w-4"
                        />
                      </IconButton>
                    </Tooltip>

                    <Tooltip content="Discard">
                      <IconButton
                        ariaLabel="delete-value"
                        variant="plain"
                        colorSchema="danger"
                        size="md"
                        className="p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => handleDeletePending(secret)}
                      >
                        <FontAwesomeSymbol
                          symbolName={FontAwesomeSpriteName.Close}
                          className="h-5 w-4"
                        />
                      </IconButton>
                    </Tooltip>
                  </motion.div>
                ) : (
                  <motion.div
                    key="options"
                    className="flex w-[63px] flex-shrink-0 items-center justify-between px-3"
                    initial={{ x: 0, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 10, opacity: 0 }}
                  >
                    <Tooltip content="More">
                      <IconButton
                        ariaLabel="more"
                        variant="plain"
                        size="md"
                        className="h-5 w-4 p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => onDetailViewSecret(secret)}
                      >
                        <FontAwesomeSymbol
                          symbolName={FontAwesomeSpriteName.More}
                          className="h-5 w-4"
                        />
                      </IconButton>
                    </Tooltip>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Delete}
                      a={subject(ProjectPermissionSub.Secrets, {
                        environment,
                        secretPath,
                        secretName,
                        secretTags: selectedTagSlugs
                      })}
                      renderTooltip
                      allowedLabel={isRotatedSecret ? "Cannot Delete Rotated Secret" : "Delete"}
                    >
                      {(isAllowed) => (
                        <IconButton
                          ariaLabel="delete-value"
                          variant="plain"
                          colorSchema="danger"
                          size="md"
                          className="p-0 opacity-0 group-hover:opacity-100"
                          onClick={() => onDeleteSecret(secret)}
                          isDisabled={!isAllowed || isRotatedSecret}
                        >
                          <FontAwesomeSymbol
                            symbolName={FontAwesomeSpriteName.Trash}
                            className="h-4 w-3"
                          />
                        </IconButton>
                      )}
                    </ProjectPermissionCan>
                  </motion.div>
                )
              ) : (
                <motion.div
                  key="options-save"
                  className="flex w-[63px] flex-shrink-0 items-center justify-between px-3"
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -10, opacity: 0 }}
                >
                  <Tooltip
                    content={
                      Object.keys(errors || {}).length
                        ? Object.entries(errors)
                            .map(([key, { message }]) => `Field ${key}: ${message}`)
                            .join("\n")
                        : "Save"
                    }
                  >
                    <IconButton
                      ariaLabel="more"
                      variant="plain"
                      type="submit"
                      size="md"
                      className={twMerge(
                        "p-0 text-primary opacity-0 group-hover:opacity-100",
                        isDirty && "opacity-100"
                      )}
                      isDisabled={isSubmitting || Boolean(errors.key)}
                    >
                      {isSubmitting ? (
                        <Spinner className="m-0 h-4 w-4 p-0" />
                      ) : (
                        <FontAwesomeSymbol
                          symbolName={FontAwesomeSpriteName.Check}
                          className={twMerge(
                            "h-4 w-4 text-primary",
                            Boolean(Object.keys(errors || {}).length) && "text-red"
                          )}
                        />
                      )}
                    </IconButton>
                  </Tooltip>
                  <Tooltip content="Cancel">
                    <IconButton
                      ariaLabel="more"
                      variant="plain"
                      size="md"
                      className={twMerge(
                        "p-0 opacity-0 group-hover:opacity-100",
                        isDirty && "opacity-100"
                      )}
                      onClick={() => reset()}
                      isDisabled={isSubmitting}
                    >
                      <FontAwesomeSymbol
                        symbolName={FontAwesomeSpriteName.Close}
                        className="h-4 w-4 text-primary"
                      />
                    </IconButton>
                  </Tooltip>
                </motion.div>
              )}
            </AnimatePresence>
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
                secretsToDelete={[secret.key]}
                onlyReferences
              />
            )
          }
        />
      </form>
    );
  }
);

SecretItem.displayName = "SecretItem";
