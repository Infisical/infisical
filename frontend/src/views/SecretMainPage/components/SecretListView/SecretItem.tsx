/* eslint-disable simple-import-sort/imports */
import { memo, useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faCheck,
  faClock,
  faClose,
  faCodeBranch,
  faComment,
  faCopy,
  faEllipsis,
  faKey,
  faTag,
  faTags
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  FormControl,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SecretInput,
  Spinner,
  TextArea,
  Tooltip
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { useToggle } from "@app/hooks";
import { DecryptedSecret } from "@app/hooks/api/secrets/types";
import { WsTag } from "@app/hooks/api/types";

import { formSchema, SecretActionType, TFormSchema } from "./SecretListView.utils";
import { CreateReminderForm } from "./CreateReminderForm";

type Props = {
  secret: DecryptedSecret;
  onSaveSecret: (
    orgSec: DecryptedSecret,
    modSec: Omit<DecryptedSecret, "tags"> & { tags: { _id: string }[] },
    cb?: () => void
  ) => Promise<void>;
  onDeleteSecret: (sec: DecryptedSecret) => void;
  onDetailViewSecret: (sec: DecryptedSecret) => void;
  isVisible?: boolean;
  isSelected?: boolean;
  onToggleSecretSelect: (id: string) => void;
  tags: WsTag[];
  onCreateTag: () => void;
  environment: string;
  secretPath: string;
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
    secretPath
  }: Props) => {
    const { currentWorkspace } = useWorkspace();
    const permission = useProjectPermission();
    const isReadOnly =
      permission.can(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      ) &&
      permission.cannot(
        ProjectPermissionActions.Edit,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      );

    const {
      handleSubmit,
      control,
      register,
      watch,
      setValue,
      reset,
      getValues,
      formState: { isDirty, isSubmitting }
    } = useForm<TFormSchema>({
      defaultValues: secret,
      values: secret,
      resolver: zodResolver(formSchema)
    });

    const overrideAction = watch("overrideAction");
    const hasComment = Boolean(watch("comment"));
    const hasReminder = Boolean(watch("reminderRepeatDays"));

    const selectedTags = watch("tags", []);
    const selectedTagsGroupById = selectedTags.reduce<Record<string, boolean>>(
      (prev, curr) => ({ ...prev, [curr._id]: true }),
      {}
    );
    const { fields, append, remove } = useFieldArray({
      control,
      name: "tags"
    });

    const [isSecValueCopied, setIsSecValueCopied] = useToggle(false);
    const [createReminderFormOpen, setCreateReminderFormOpen] = useToggle(false);
    useEffect(() => {
      let timer: NodeJS.Timeout;
      if (isSecValueCopied) {
        timer = setTimeout(() => setIsSecValueCopied.off(), 2000);
      }
      return () => clearTimeout(timer);
    }, [isSecValueCopied]);

    const isOverriden =
      overrideAction === SecretActionType.Created || overrideAction === SecretActionType.Modified;
    const hasTagsApplied = Boolean(fields.length);

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
      await onSaveSecret(secret, { ...secret, ...data }, () => reset());
    };

    const handleTagSelect = (tag: WsTag) => {
      if (selectedTagsGroupById?.[tag._id]) {
        const tagPos = selectedTags.findIndex(({ _id }) => _id === tag._id);
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

    return (
      <>
        <CreateReminderForm
          isOpen={createReminderFormOpen}
          onOpenChange={(_, data) => {
            setCreateReminderFormOpen.toggle();

            if (data) {
              setValue("reminderRepeatDays", data.days, { shouldDirty: true });
              setValue("reminderNote", data.note, { shouldDirty: true });
            }
          }}
        />

        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <div
            className={twMerge(
              "border-b border-mineshaft-600 bg-mineshaft-800 shadow-none hover:bg-mineshaft-700",
              isDirty && "border-primary-400/50"
            )}
          >
            <div className="group flex">
              <div
                className={twMerge(
                  "flex h-11 w-11 items-center justify-center px-4 py-3",
                  isDirty && "text-primary"
                )}
              >
                <Checkbox
                  id={`checkbox-${secret._id}`}
                  isChecked={isSelected}
                  onCheckedChange={() => onToggleSecretSelect(secret._id)}
                  className={twMerge("ml-3 hidden group-hover:flex", isSelected && "flex")}
                />
                <FontAwesomeIcon
                  icon={faKey}
                  className={twMerge("ml-3 block group-hover:hidden", isSelected && "hidden")}
                />
              </div>
              <div className="flex h-11 w-80 flex-shrink-0 items-center px-4 py-2">
                <Controller
                  name="key"
                  control={control}
                  render={({ field }) => (
                    <Input
                      autoComplete="off"
                      isReadOnly={isReadOnly}
                      autoCapitalization={currentWorkspace?.autoCapitalization}
                      variant="plain"
                      isDisabled={isOverriden}
                      {...field}
                      className="w-full px-0 focus:text-bunker-100 focus:ring-transparent"
                    />
                  )}
                />
              </div>
              <div
                className="flex flex-grow items-center border-x border-mineshaft-600 py-1 pl-4 pr-2"
                tabIndex={0}
                role="button"
              >
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
                        containerClassName="py-1.5 rounded-md transition-all group-hover:mr-2"
                      />
                    )}
                  />
                ) : (
                  <Controller
                    name="value"
                    key="secret-value"
                    control={control}
                    render={({ field }) => (
                      <SecretInput
                        isReadOnly={isReadOnly}
                        key="secret-value"
                        isVisible={isVisible}
                        {...field}
                        containerClassName="py-1.5 rounded-md transition-all group-hover:mr-2"
                      />
                    )}
                  />
                )}
                <div key="actions" className="flex h-8 flex-shrink-0 self-start transition-all">
                  <Tooltip content="Copy secret">
                    <IconButton
                      ariaLabel="copy-value"
                      variant="plain"
                      size="sm"
                      className="w-0 overflow-hidden p-0 group-hover:mr-2 group-hover:w-5"
                      onClick={copyTokenToClipboard}
                    >
                      <FontAwesomeIcon icon={isSecValueCopied ? faCheck : faCopy} />
                    </IconButton>
                  </Tooltip>
                  <DropdownMenu>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
                    >
                      {(isAllowed) => (
                        <DropdownMenuTrigger asChild disabled={!isAllowed}>
                          <IconButton
                            ariaLabel="tags"
                            variant="plain"
                            size="sm"
                            className={twMerge(
                              "w-0 overflow-hidden p-0 group-hover:mr-2 group-hover:w-5 data-[state=open]:w-5",
                              hasTagsApplied && "w-5 text-primary"
                            )}
                            isDisabled={!isAllowed}
                          >
                            <Tooltip content="Tags">
                              <FontAwesomeIcon icon={faTags} />
                            </Tooltip>
                          </IconButton>
                        </DropdownMenuTrigger>
                      )}
                    </ProjectPermissionCan>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Apply tags to this secrets</DropdownMenuLabel>
                      {tags.map((tag) => {
                        const { _id: tagId, name, tagColor } = tag;

                        const isTagSelected = selectedTagsGroupById?.[tagId];
                        return (
                          <DropdownMenuItem
                            onClick={() => handleTagSelect(tag)}
                            key={tagId}
                            icon={isTagSelected && <FontAwesomeIcon icon={faCheckCircle} />}
                            iconPos="right"
                          >
                            <div className="flex items-center">
                              <div
                                className="mr-2 h-2 w-2 rounded-full"
                                style={{ background: tagColor || "#bec2c8" }}
                              />
                              {name}
                            </div>
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuItem className="px-1.5">
                        <Button
                          size="xs"
                          className="w-full"
                          colorSchema="primary"
                          variant="outline_bg"
                          leftIcon={<FontAwesomeIcon icon={faTag} />}
                          onClick={onCreateTag}
                        >
                          Create a tag
                        </Button>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Edit}
                    a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
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
                          "w-0 overflow-hidden p-0 group-hover:mr-2 group-hover:w-5",
                          isOverriden && "w-5 text-primary"
                        )}
                      >
                        <FontAwesomeIcon icon={faCodeBranch} />
                      </IconButton>
                    )}
                  </ProjectPermissionCan>

                  {!isOverriden && (
                    <IconButton
                      className={twMerge(
                        "w-0 overflow-hidden p-0 group-hover:mr-2 group-hover:w-5 data-[state=open]:w-6",
                        hasReminder && "w-5 text-primary"
                      )}
                      variant="plain"
                      size="md"
                      ariaLabel="add-reminder"
                    >
                      <Tooltip content="Reminder">
                        <FontAwesomeIcon
                          onClick={() => {
                            if (!hasReminder) {
                              setCreateReminderFormOpen.on();
                            } else {
                              setValue("reminderRepeatDays", null, { shouldDirty: true });
                              setValue("reminderNote", null, { shouldDirty: true });
                            }
                          }}
                          icon={faClock}
                        />
                      </Tooltip>
                    </IconButton>
                  )}

                  <Popover>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
                    >
                      {(isAllowed) => (
                        <PopoverTrigger asChild disabled={!isAllowed}>
                          <IconButton
                            className={twMerge(
                              "w-0 overflow-hidden p-0 group-hover:mr-2 group-hover:w-5 data-[state=open]:w-6",
                              hasComment && "w-5 text-primary"
                            )}
                            variant="plain"
                            size="md"
                            ariaLabel="add-comment"
                            isDisabled={!isAllowed}
                          >
                            <Tooltip content="Comment">
                              <FontAwesomeIcon icon={faComment} />
                            </Tooltip>
                          </IconButton>
                        </PopoverTrigger>
                      )}
                    </ProjectPermissionCan>
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
              </div>
              <AnimatePresence exitBeforeEnter>
                {!isDirty ? (
                  <motion.div
                    key="options"
                    className="flex h-10 flex-shrink-0 items-center space-x-4 px-3"
                    initial={{ x: 0, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 10, opacity: 0 }}
                  >
                    <Tooltip content="More">
                      <IconButton
                        ariaLabel="more"
                        variant="plain"
                        size="md"
                        className="p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => onDetailViewSecret(secret)}
                      >
                        <FontAwesomeIcon icon={faEllipsis} size="lg" />
                      </IconButton>
                    </Tooltip>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Delete}
                      a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
                      renderTooltip
                      allowedLabel="Delete"
                    >
                      {(isAllowed) => (
                        <IconButton
                          ariaLabel="delete-value"
                          variant="plain"
                          colorSchema="danger"
                          size="md"
                          className="p-0 opacity-0 group-hover:opacity-100"
                          onClick={() => onDeleteSecret(secret)}
                          isDisabled={!isAllowed}
                        >
                          <FontAwesomeIcon icon={faClose} size="lg" />
                        </IconButton>
                      )}
                    </ProjectPermissionCan>
                  </motion.div>
                ) : (
                  <motion.div
                    key="options-save"
                    className="flex h-10 flex-shrink-0 items-center space-x-4 px-3"
                    initial={{ x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -10, opacity: 0 }}
                  >
                    <Tooltip content="Save">
                      <IconButton
                        ariaLabel="more"
                        variant="plain"
                        type="submit"
                        size="md"
                        className={twMerge(
                          "p-0 text-primary opacity-0 group-hover:opacity-100",
                          isDirty && "opacity-100"
                        )}
                        isDisabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <Spinner className="m-0 h-4 w-4 p-0" />
                        ) : (
                          <FontAwesomeIcon icon={faCheck} size="lg" className="text-primary" />
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
                        <FontAwesomeIcon icon={faClose} size="lg" />
                      </IconButton>
                    </Tooltip>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </form>
      </>
    );
  }
);

SecretItem.displayName = "SecretItem";
