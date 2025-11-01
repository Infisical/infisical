import { memo, useCallback, useEffect, useRef } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import {
  faBell,
  faCheck,
  faCodeBranch,
  faCopy,
  faEyeSlash,
  faInfoCircle,
  faKey,
  faRotate,
  faShare,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

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
  GenericFieldLabel,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { InlineActionIconButton } from "@app/components/v2/IconButton/InlineActionIconButton";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp, useToggle } from "@app/hooks";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import { WsTag } from "@app/hooks/api/types";
import { useCopySecretToClipBoard } from "@app/hooks/secret-operations/useCopySecretToClipboard";
import { useCreatePersonalSecretOverride } from "@app/hooks/secret-operations/useCreatePersonalSecret";
import { useCreateSharedSecretPopup } from "@app/hooks/secret-operations/useCreateSharedSecret";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";
import { CreateReminderForm } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/CreateReminderForm";

import { useBatchModeActions } from "../../SecretMainPage.store";
import { SecretPersonalOverrideView } from "../SecretPersonalOverride/SecretPersonalOverrideView";
import { CollapsibleSecretImports } from "./CollapsibleSecretImports";
import { FontAwesomeSpriteName, formSchema, TFormSchema } from "./SecretListView.utils";

export const HIDDEN_SECRET_VALUE = "*************************";
export const HIDDEN_SECRET_VALUE_API_MASK = "<hidden-by-infisical>";

type Props = {
  secret: SecretV3RawSanitized & { originalKey?: string };
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
  onCreateTag: (secret?: SecretV3RawSanitized) => void;
  environment: string;
  secretPath: string;
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
    secret: originalSecret,
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
    importedBy,
    isPending,
    pendingAction,
    colWidth
  }: Props) => {
    const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
      "editSecret",
      "reminder"
    ] as const);
    const { currentProject } = useProject();
    const { permission } = useProjectPermission();
    const { removePendingChange } = useBatchModeActions();

    const [isSecretFieldFocused, setSecretIsFieldFocused] = useToggle();
    const [isKeyFieldFocused, setIsKeyFieldFocused] = useToggle();

    const canFetchSecretValue =
      !originalSecret.secretValueHidden &&
      !originalSecret.isEmpty &&
      pendingAction !== PendingAction.Create;

    const fetchSecretValueParams = {
      environment,
      secretPath,
      secretKey: originalSecret.originalKey || originalSecret.key,
      projectId: currentProject.id,
      isOverride: false
    };

    const {
      data: secretValueData,
      isPending: isPendingSecretValueData,
      isError: isErrorFetchingSecretValue
    } = useGetSecretValue(fetchSecretValueParams, {
      enabled: canFetchSecretValue && (isVisible || isSecretFieldFocused)
    });

    const isLoadingSecretValue = canFetchSecretValue && isPendingSecretValueData;

    const secret = {
      ...originalSecret,
      value: originalSecret.value ?? secretValueData?.value
    };

    const { isRotatedSecret } = secret;

    const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();
    const isAutoSavingRef = useRef(false);

    const handleDeletePending = (pendingSecret: SecretV3RawSanitized) => {
      removePendingChange(pendingSecret.id, "secret", {
        projectId: currentProject.id,
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
      if (isLoadingSecretValue) return undefined;

      if (secret.secretValueHidden && !isPending) {
        return canEditSecretValue ? HIDDEN_SECRET_VALUE : "";
      }

      if (isErrorFetchingSecretValue) return undefined;

      return secret.value || "";
    };

    const {
      handleSubmit,
      control,
      register,
      watch,
      reset,
      getValues,
      trigger,
      formState: { isDirty, isSubmitting },
      getFieldState
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

    const hasOverride = Boolean(secret.idOverride);
    const hasTagsApplied = Boolean(fields.length);

    const openCreateSharedSecretPopup = useCreateSharedSecretPopup({
      getFetchedValue: () => getValues("value"),
      fetchSecretParams: fetchSecretValueParams
    });

    const autoSaveChanges = useCallback(
      async (data: TFormSchema) => {
        if (isAutoSavingRef.current) return;

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
        const debounceTime = 200;

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
      isReadOnly ||
      isRotatedSecret ||
      (isPending && pendingAction === PendingAction.Delete) ||
      isLoadingSecretValue;

    const { secretValueHidden } = secret;

    const createPersonalSecretOverride = useCreatePersonalSecretOverride(currentProject.id);

    const handleAddPersonalOverride = useCallback(async () => {
      createPersonalSecretOverride(
        {
          key: originalSecret.key,
          environment,
          secretPath
        },
        secretValueData?.value
      );
    }, [createPersonalSecretOverride, secretValueData?.value]);

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

    const { copySecretToClipboard, isSecretValueCopied } = useCopySecretToClipBoard({
      getFetchedValue: () => getValues("value") as string,
      fetchSecretParams: fetchSecretValueParams
    });

    const keyInputWarning = useCallback(
      (value?: string) => {
        if (value !== (originalSecret.originalKey || originalSecret.key) && value?.includes(" ")) {
          return (
            <Tooltip
              className="w-full max-w-72"
              content={
                <div>
                  Secret key contains whitespaces.
                  <br />
                  <br /> If this is the desired format, you need to provide it as{" "}
                  <code className="rounded-md bg-mineshaft-500 px-1 py-0.5">
                    {encodeURIComponent(value.trim())}
                  </code>{" "}
                  when making API requests.
                </div>
              }
            >
              <FontAwesomeIcon icon={faWarning} className="text-yellow-600 opacity-60" />
            </Tooltip>
          );
        }
        if (hasOverride && isKeyFieldFocused) {
          return (
            <Tooltip
              className="w-full max-w-72"
              content="Remove personal override before changing the key"
            >
              <FontAwesomeIcon icon={faInfoCircle} className="text-yellow-600 opacity-60" />
            </Tooltip>
          );
        }
        return null;
      },
      [originalSecret.originalKey, originalSecret.key, hasOverride, isKeyFieldFocused]
    );

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
                    className="absolute -right-[0.2rem] -bottom-[0.05rem] text-mineshaft-400"
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
                      "ml-3 block h-3.5 w-3.5 group-hover:!hidden",
                      isSelected && "!hidden"
                    )}
                    symbolName={FontAwesomeSpriteName.SecretKey}
                  />
                </>
              )}
            </div>
            <div className="flex h-11 shrink-0 items-center px-4 py-2" style={{ width: colWidth }}>
              <Controller
                name="key"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Input
                    autoComplete="off"
                    isReadOnly={isReadOnly || isRotatedSecret || hasOverride}
                    autoCapitalization={currentProject?.autoCapitalization}
                    variant="plain"
                    placeholder={error?.message}
                    isError={Boolean(error)}
                    onKeyUp={() => trigger("key")}
                    warning={keyInputWarning(field?.value)}
                    {...field}
                    onFocus={() => {
                      setIsKeyFieldFocused.on();
                    }}
                    onBlur={() => {
                      setIsKeyFieldFocused.off();
                      field.onBlur();
                    }}
                    className="w-full px-0 placeholder:text-red-500 focus:text-bunker-100 focus:ring-transparent"
                  />
                )}
              />
            </div>
            <div className="flex grow flex-col divide-y divide-mineshaft-600 border-x border-mineshaft-600">
              <div className="flex">
                <div
                  className="flex w-80 grow items-center py-1 pr-2 pl-4"
                  tabIndex={0}
                  role="button"
                >
                  {secretValueHidden && !getFieldState("value").isDirty && (
                    <Tooltip
                      content={`You do not have access to view the current value${canEditSecretValue && !isRotatedSecret ? ", but you can set a new one" : "."}`}
                    >
                      <FontAwesomeIcon className="pr-2" size="sm" icon={faEyeSlash} />
                    </Tooltip>
                  )}
                  <Controller
                    name="value"
                    key="secret-value"
                    control={control}
                    render={({ field }) => (
                      <InfisicalSecretInput
                        isLoadingValue={isLoadingSecretValue}
                        isErrorLoadingValue={isErrorFetchingSecretValue}
                        isReadOnly={isReadOnlySecret}
                        key="secret-value"
                        isVisible={isVisible && (!secretValueHidden || isPending)}
                        canEditButNotView={secretValueHidden && !isPending}
                        environment={environment}
                        secretPath={secretPath}
                        {...field}
                        onFocus={() => {
                          setSecretIsFieldFocused.on();
                        }}
                        onBlur={() => {
                          setSecretIsFieldFocused.off();
                          field.onBlur();
                        }}
                        defaultValue={
                          secretValueHidden && !isPending ? HIDDEN_SECRET_VALUE : undefined
                        }
                        containerClassName="py-1.5 rounded-md transition-all"
                      />
                    )}
                  />
                  {pendingAction !== PendingAction.Create &&
                    pendingAction !== PendingAction.Delete && (
                      <div
                        key="actions"
                        className="flex h-full shrink-0 self-start transition-all group-hover:gap-x-2"
                      >
                        <InlineActionIconButton
                          isDisabled={secret.secretValueHidden}
                          hint="Copy secret"
                          icon={isSecretValueCopied ? faCheck : faCopy}
                          onClick={copySecretToClipboard}
                          revealOnGroupHover
                        />

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
                            <InlineActionIconButton
                              isDisabled={!isAllowed}
                              revealOnGroupHover
                              onClick={() => handlePopUpOpen("reminder")}
                              className={secret?.reminder && "text-primary"}
                              icon={faBell}
                              hint={
                                secret.reminder ? (
                                  <div className="flex flex-col gap-y-1">
                                    <GenericFieldLabel label="Reminder Date">
                                      {secret.reminder.nextReminderDate
                                        ? format(
                                            new Date(secret.reminder.nextReminderDate),
                                            "h:mm aa - MMM d yyyy"
                                          )
                                        : undefined}
                                    </GenericFieldLabel>
                                    <GenericFieldLabel label="Message">
                                      {secret.reminder.message}
                                    </GenericFieldLabel>
                                  </div>
                                ) : (
                                  "Set Secret Reminder"
                                )
                              }
                            />
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
                                onClick={() => onCreateTag(secret)}
                              >
                                Create a tag
                              </Button>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Create}
                          a={subject(ProjectPermissionSub.Secrets, {
                            environment,
                            secretPath,
                            secretName,
                            secretTags: selectedTagSlugs
                          })}
                        >
                          {(isAllowed) => (
                            <InlineActionIconButton
                              hint="Add Override"
                              isHidden={hasOverride}
                              icon={faCodeBranch}
                              isDisabled={!isAllowed}
                              onClick={handleAddPersonalOverride}
                              revealOnGroupHover
                            />
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
                          <InlineActionIconButton
                            isDisabled={secret.secretValueHidden || !currentProject.secretSharing}
                            revealOnGroupHover
                            onClick={openCreateSharedSecretPopup}
                            icon={faShare}
                            hint="Share Secret"
                          />
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
                      className="flex h-full shrink-0 self-start transition-all group-hover:gap-x-2"
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
                              onClick={() => onCreateTag(secret)}
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
                  <motion.div
                    key="options"
                    className="flex w-[63px] shrink-0 items-center justify-between px-3"
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
                        isDisabled={originalSecret.pendingAction === "create"}
                      >
                        <FontAwesomeSymbol
                          symbolName={FontAwesomeSpriteName.More}
                          className="h-5 w-4"
                        />
                      </IconButton>
                    </Tooltip>
                    {isPending && (
                      <Tooltip content="Discard">
                        <IconButton
                          ariaLabel="discard-change"
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
                    )}
                    {!isPending && (
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
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
              {hasOverride && (
                <SecretPersonalOverrideView
                  secretKey={secret.key}
                  secretPath={secretPath}
                  environment={environment}
                  isVisible={isVisible}
                  projectId={currentProject.id}
                  className="space-x-2 py-1 pr-2 pl-4"
                />
              )}
            </div>
          </div>
        </div>
        <CreateReminderForm
          isOpen={popUp.reminder.isOpen}
          onOpenChange={() => handlePopUpToggle("reminder")}
          projectId={currentProject.id}
          environment={environment}
          secretPath={secretPath}
          secretId={secret?.id}
          reminder={secret.reminder}
        />
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
