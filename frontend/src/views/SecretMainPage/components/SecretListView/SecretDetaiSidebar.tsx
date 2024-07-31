import { Controller, useFieldArray, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import {
  faCheckCircle,
  faCircle,
  faCircleDot,
  faClock,
  faPlus,
  faShare,
  faTag
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Drawer,
  DrawerContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  FormControl,
  IconButton,
  Input,
  Switch,
  Tag,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { useToggle } from "@app/hooks";
import { useGetSecretVersion } from "@app/hooks/api";
import { SecretV3RawSanitized, WsTag } from "@app/hooks/api/types";

import { CreateReminderForm } from "./CreateReminderForm";
import { formSchema, SecretActionType, TFormSchema } from "./SecretListView.utils";

type Props = {
  isOpen?: boolean;
  environment: string;
  secretPath: string;
  onToggle: (isOpen: boolean) => void;
  onClose: () => void;
  secret: SecretV3RawSanitized;
  onDeleteSecret: () => void;
  onSaveSecret: (
    orgSec: SecretV3RawSanitized,
    modSec: Omit<SecretV3RawSanitized, "tags"> & { tags?: { id: string }[] },
    cb?: () => void
  ) => Promise<void>;
  tags: WsTag[];
  onCreateTag: () => void;
  handleSecretShare: (value: string) => void;
};

export const SecretDetailSidebar = ({
  isOpen,
  onToggle,
  secret,
  onDeleteSecret,
  onSaveSecret,
  tags,
  onCreateTag,
  environment,
  secretPath,
  handleSecretShare
}: Props) => {
  const {
    register,
    control,
    watch,
    handleSubmit,
    setValue,
    reset,
    formState: { isDirty, isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    values: secret
  });
  const { permission } = useProjectPermission();
  const cannotEditSecret = permission.cannot(
    ProjectPermissionActions.Edit,
    subject(ProjectPermissionSub.Secrets, { environment, secretPath })
  );
  const isReadOnly =
    permission.can(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    ) && cannotEditSecret;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "tags"
  });
  const selectedTags = watch("tags", []) || [];
  const selectedTagsGroupById = selectedTags.reduce<Record<string, boolean>>(
    (prev, curr) => ({ ...prev, [curr.id]: true }),
    {}
  );

  const overrideAction = watch("overrideAction");
  const isOverridden =
    overrideAction === SecretActionType.Created || overrideAction === SecretActionType.Modified;

  const { data: secretVersion } = useGetSecretVersion({
    limit: 10,
    offset: 0,
    secretId: secret?.id
  });

  const handleOverrideClick = () => {
    if (isOverridden) {
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
    } else {
      setValue("overrideAction", SecretActionType.Modified, { shouldDirty: true });
      setValue("valueOverride", "", { shouldDirty: true });
    }
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

  const handleFormSubmit = async (data: TFormSchema) => {
    await onSaveSecret(secret, { ...secret, ...data }, () => reset());
  };

  const [createReminderFormOpen, setCreateReminderFormOpen] = useToggle(false);

  const secretReminderRepeatDays = watch("reminderRepeatDays");
  const secretReminderNote = watch("reminderNote");

  return (
    <>
      <CreateReminderForm
        repeatDays={secretReminderRepeatDays}
        note={secretReminderNote}
        isOpen={createReminderFormOpen}
        onOpenChange={(_, data) => {
          setCreateReminderFormOpen.toggle();

          if (data) {
            setValue("reminderRepeatDays", data.days, { shouldDirty: true });
            setValue("reminderNote", data.note, { shouldDirty: true });
          }
        }}
      />
      <Drawer
        onOpenChange={(state) => {
          if (isOpen && isDirty) {
            if (
              // eslint-disable-next-line no-alert
              window.confirm(
                "You have edited the secret. Are you sure you want to reset the change?"
              )
            ) {
              onToggle(false);
              reset();
            } else return;
          }
          onToggle(state);
        }}
        isOpen={isOpen}
      >
        <DrawerContent title="Secret">
          <form onSubmit={handleSubmit(handleFormSubmit)} className="h-full">
            <div className="flex h-full flex-col">
              <FormControl label="Key">
                <Input isDisabled {...register("key")} />
              </FormControl>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
              >
                {(isAllowed) => (
                  <Controller
                    name="value"
                    key="secret-value"
                    control={control}
                    render={({ field }) => (
                      <FormControl label="Value">
                        <InfisicalSecretInput
                          isReadOnly={isReadOnly}
                          environment={environment}
                          secretPath={secretPath}
                          key="secret-value"
                          isDisabled={isOverridden || !isAllowed}
                          containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-bunker-800  px-2 py-1.5"
                          {...field}
                          autoFocus={false}
                        />
                      </FormControl>
                    )}
                  />
                )}
              </ProjectPermissionCan>
              <div className="mb-2 border-b border-mineshaft-600 pb-4">
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
                >
                  {(isAllowed) => (
                    <Switch
                      isDisabled={!isAllowed}
                      id="personal-override"
                      onCheckedChange={handleOverrideClick}
                      isChecked={isOverridden}
                    >
                      Override with a personal value
                    </Switch>
                  )}
                </ProjectPermissionCan>
              </div>
              {isOverridden && (
                <Controller
                  name="valueOverride"
                  control={control}
                  render={({ field }) => (
                    <FormControl label="Value Override">
                      <InfisicalSecretInput
                        isReadOnly={isReadOnly}
                        environment={environment}
                        secretPath={secretPath}
                        containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-bunker-800  px-2 py-1.5"
                        {...field}
                      />
                    </FormControl>
                  )}
                />
              )}
              <FormControl label="Tags" className="">
                <div className="grid auto-cols-min grid-flow-col gap-2 overflow-hidden pt-2">
                  {fields.map(({ tagColor, id: formId, name, id }) => (
                    <Tag
                      className="flex w-min items-center space-x-2"
                      key={formId}
                      onClose={() => {
                        if (cannotEditSecret) {
                          createNotification({ type: "error", text: "Access denied" });
                          return;
                        }
                        const tag = tags?.find(({ id: tagId }) => id === tagId);
                        if (tag) handleTagSelect(tag);
                      }}
                    >
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: tagColor || "#bec2c8" }}
                      />
                      <div className="text-sm">{name}</div>
                    </Tag>
                  ))}
                  <DropdownMenu>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
                    >
                      {(isAllowed) => (
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            ariaLabel="add"
                            variant="outline_bg"
                            size="xs"
                            className="rounded-md"
                            isDisabled={!isAllowed}
                          >
                            <FontAwesomeIcon icon={faPlus} />
                          </IconButton>
                        </DropdownMenuTrigger>
                      )}
                    </ProjectPermissionCan>
                    <DropdownMenuContent align="end" className="z-[100]">
                      <DropdownMenuLabel>Add tags to this secret</DropdownMenuLabel>
                      {tags.map((tag) => {
                        const { id: tagId, name, color } = tag;

                        const isSelected = selectedTagsGroupById?.[tagId];
                        return (
                          <DropdownMenuItem
                            onClick={() => handleTagSelect(tag)}
                            key={tagId}
                            icon={isSelected && <FontAwesomeIcon icon={faCheckCircle} />}
                            iconPos="right"
                          >
                            <div className="flex items-center">
                              <div
                                className="mr-2 h-2 w-2 rounded-full"
                                style={{ background: color || "#bec2c8" }}
                              />
                              {name}
                            </div>
                          </DropdownMenuItem>
                        );
                      })}
                      <ProjectPermissionCan
                        I={ProjectPermissionActions.Create}
                        a={ProjectPermissionSub.Tags}
                      >
                        {(isAllowed) => (
                          <DropdownMenuItem asChild>
                            <Button
                              size="xs"
                              className="w-full"
                              colorSchema="primary"
                              variant="outline_bg"
                              leftIcon={<FontAwesomeIcon icon={faTag} />}
                              onClick={onCreateTag}
                              isDisabled={!isAllowed}
                            >
                              Create a tag
                            </Button>
                          </DropdownMenuItem>
                        )}
                      </ProjectPermissionCan>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </FormControl>
              <FormControl label="Reminder">
                {secretReminderRepeatDays && secretReminderRepeatDays > 0 ? (
                  <div className="mt-2 ml-1 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <FontAwesomeIcon className="text-primary-500" icon={faClock} />
                      <span className="text-sm text-bunker-300">
                        Reminder every {secretReminderRepeatDays}{" "}
                        {secretReminderRepeatDays > 1 ? "days" : "day"}
                      </span>
                    </div>
                    <div>
                      <Button
                        className="px-2 py-1"
                        variant="outline_bg"
                        onClick={() => setCreateReminderFormOpen.on()}
                      >
                        Update
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 ml-1 flex items-center space-x-2">
                    <Button
                      className="px-2 py-1"
                      variant="outline_bg"
                      leftIcon={<FontAwesomeIcon icon={faClock} />}
                      onClick={() => setCreateReminderFormOpen.on()}
                    >
                      Create Reminder
                    </Button>
                  </div>
                )}
              </FormControl>
              <FormControl label="Comments & Notes">
                <TextArea
                  className="border border-mineshaft-600 text-sm"
                  {...register("comment")}
                  readOnly={isReadOnly}
                  rows={5}
                />
              </FormControl>
              <div className="my-2 mb-4 border-b border-mineshaft-600 pb-4">
                <Controller
                  control={control}
                  name="skipMultilineEncoding"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
                    >
                      {(isAllowed) => (
                        <Switch
                          id="skipmultiencoding-option"
                          onCheckedChange={(isChecked) => onChange(isChecked)}
                          isChecked={value}
                          onBlur={onBlur}
                          isDisabled={!isAllowed}
                          className="items-center"
                        >
                          Multi line encoding
                          <Tooltip
                            content="When enabled, multiline secrets will be handled by escaping newlines and enclosing the entire value in double quotes."
                            className="z-[100]"
                          >
                            <FontAwesomeIcon icon={faCircleQuestion} className="ml-1" size="sm" />
                          </Tooltip>
                        </Switch>
                      )}
                    </ProjectPermissionCan>
                  )}
                />
              </div>
              <div className="ml-1 flex items-center space-x-2">
                <Button
                  className="px-2 py-1"
                  variant="outline_bg"
                  leftIcon={<FontAwesomeIcon icon={faShare} />}
                  onClick={() => {
                    const value = secret?.valueOverride ?? secret?.value;
                    if (value) {
                      handleSecretShare(value);
                    }
                  }}
                >
                  Share Secret
                </Button>
              </div>
              <div className="dark mt-4 mb-4 flex-grow text-sm text-bunker-300">
                <div className="mb-2">Version History</div>
                <div className="flex h-48 flex-col space-y-2 overflow-y-auto overflow-x-hidden rounded-md border border-mineshaft-600 bg-bunker-800 p-2 dark:[color-scheme:dark]">
                  {secretVersion?.map(({ createdAt, secretValue, id }, i) => (
                    <div key={id} className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-2">
                        <div>
                          <FontAwesomeIcon icon={i === 0 ? faCircleDot : faCircle} size="sm" />
                        </div>
                        <div>{format(new Date(createdAt), "Pp")}</div>
                      </div>
                      <div className="ml-1.5 flex items-center space-x-2 border-l border-bunker-300 pl-4">
                        <div className="self-start rounded-sm bg-primary-500/30 px-1">Value:</div>
                        <div className="break-all font-mono">{secretValue}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col space-y-4">
                <div className="flex items-center space-x-4">
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Edit}
                    a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
                  >
                    {(isAllowed) => (
                      <Button
                        isFullWidth
                        type="submit"
                        isDisabled={isSubmitting || !isDirty || !isAllowed}
                        isLoading={isSubmitting}
                      >
                        Save Changes
                      </Button>
                    )}
                  </ProjectPermissionCan>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Delete}
                    a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
                  >
                    {(isAllowed) => (
                      <Button colorSchema="danger" isDisabled={!isAllowed} onClick={onDeleteSecret}>
                        Delete
                      </Button>
                    )}
                  </ProjectPermissionCan>
                </div>
              </div>
            </div>
          </form>
        </DrawerContent>
      </Drawer>
    </>
  );
};
