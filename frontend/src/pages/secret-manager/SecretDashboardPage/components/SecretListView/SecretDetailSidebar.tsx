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
  faTag,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
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
  FormLabel,
  IconButton,
  Input,
  Switch,
  Tag,
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
import { useGetSecretVersion } from "@app/hooks/api";
import { useGetSecretAccessList } from "@app/hooks/api/secrets/queries";
import { SecretV3RawSanitized, WsTag } from "@app/hooks/api/types";
import { ProjectType } from "@app/hooks/api/workspace/types";

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

  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp([
    "secretAccessUpgradePlan"
  ] as const);

  const { permission } = useProjectPermission();
  const { currentWorkspace } = useWorkspace();

  const tagFields = useFieldArray({
    control,
    name: "tags"
  });

  const metadataFormFields = useFieldArray({
    control,
    name: "secretMetadata"
  });

  const secretKey = secret?.key || "";
  const selectedTags = watch("tags", []) || [];
  const selectedTagsGroupById = selectedTags.reduce<Record<string, boolean>>(
    (prev, curr) => ({ ...prev, [curr.id]: true }),
    {}
  );
  const selectTagSlugs = selectedTags.map((i) => i.slug);

  const cannotEditSecret = permission.cannot(
    ProjectPermissionActions.Edit,
    subject(ProjectPermissionSub.Secrets, {
      environment,
      secretPath,
      secretName: secretKey,
      secretTags: selectTagSlugs
    })
  );
  const isReadOnly =
    permission.can(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath,
        secretName: secretKey,
        secretTags: selectTagSlugs
      })
    ) && cannotEditSecret;

  const overrideAction = watch("overrideAction");
  const isOverridden =
    overrideAction === SecretActionType.Created || overrideAction === SecretActionType.Modified;

  const { data: secretVersion } = useGetSecretVersion({
    limit: 10,
    offset: 0,
    secretId: secret?.id
  });

  const { data: secretAccessList, isPending } = useGetSecretAccessList({
    workspaceId: currentWorkspace.id,
    environment,
    secretPath,
    secretKey
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
        tagFields.remove(tagPos);
      }
    } else {
      tagFields.append(tag);
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
      <UpgradePlanModal
        isOpen={popUp.secretAccessUpgradePlan.isOpen}
        onOpenChange={(isUpgradeModalOpen) =>
          handlePopUpToggle("secretAccessUpgradePlan", isUpgradeModalOpen)
        }
        text="Secret access analysis is only available on Infisical's Pro plan and above."
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
                a={subject(ProjectPermissionSub.Secrets, {
                  environment,
                  secretPath,
                  secretName: secretKey,
                  secretTags: selectTagSlugs
                })}
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
                  a={subject(ProjectPermissionSub.Secrets, {
                    environment,
                    secretPath,
                    secretName: secretKey,
                    secretTags: selectTagSlugs
                  })}
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
              <FormControl label="Metadata">
                <div className="flex flex-col space-y-2">
                  {metadataFormFields.fields.map(({ id: metadataFieldId }, i) => (
                    <div key={metadataFieldId} className="flex items-end space-x-2">
                      <div className="flex-grow">
                        {i === 0 && <span className="text-xs text-mineshaft-400">Key</span>}
                        <Controller
                          control={control}
                          name={`secretMetadata.${i}.key`}
                          render={({ field, fieldState: { error } }) => (
                            <FormControl
                              isError={Boolean(error?.message)}
                              errorText={error?.message}
                              className="mb-0"
                            >
                              <Input {...field} className="max-h-8" />
                            </FormControl>
                          )}
                        />
                      </div>
                      <div className="flex-grow">
                        {i === 0 && (
                          <FormLabel
                            label="Value"
                            className="text-xs text-mineshaft-400"
                            isOptional
                          />
                        )}
                        <Controller
                          control={control}
                          name={`secretMetadata.${i}.value`}
                          render={({ field, fieldState: { error } }) => (
                            <FormControl
                              isError={Boolean(error?.message)}
                              errorText={error?.message}
                              className="mb-0"
                            >
                              <Input {...field} className="max-h-8" />
                            </FormControl>
                          )}
                        />
                      </div>
                      <IconButton
                        ariaLabel="delete key"
                        className="bottom-0.5 max-h-8"
                        variant="outline_bg"
                        onClick={() => metadataFormFields.remove(i)}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </IconButton>
                    </div>
                  ))}
                  <div className="mt-2">
                    <Button
                      leftIcon={<FontAwesomeIcon icon={faPlus} />}
                      size="xs"
                      variant="outline_bg"
                      onClick={() => metadataFormFields.append({ key: "", value: "" })}
                    >
                      Add Key
                    </Button>
                  </div>
                </div>
              </FormControl>
              <FormControl label="Tags" className="">
                <div className="grid auto-cols-min grid-flow-col gap-2 overflow-hidden pt-2">
                  {tagFields.fields.map(({ tagColor, id: formId, slug, id }) => (
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
                      <div className="text-sm">{slug}</div>
                    </Tag>
                  ))}
                  <DropdownMenu>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={subject(ProjectPermissionSub.Secrets, {
                        environment,
                        secretPath,
                        secretName: secretKey,
                        secretTags: selectTagSlugs
                      })}
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
                        const { id: tagId, slug, color } = tag;

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
                              {slug}
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
                  <div className="ml-1 mt-2 flex items-center justify-between">
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
                  <div className="ml-1 mt-2 flex items-center space-x-2">
                    <Button
                      className="w-full px-2 py-1"
                      variant="outline_bg"
                      leftIcon={<FontAwesomeIcon icon={faClock} />}
                      onClick={() => setCreateReminderFormOpen.on()}
                      isDisabled={cannotEditSecret}
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
                      a={subject(ProjectPermissionSub.Secrets, {
                        environment,
                        secretPath,
                        secretName: secretKey,
                        secretTags: selectTagSlugs
                      })}
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
              <div className="ml-1 flex items-center space-x-4">
                <Button
                  className="w-full px-2 py-1"
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
              <div className="dark mb-4 mt-4 flex-grow text-sm text-bunker-300">
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
              <div className="dark mb-4 flex-grow text-sm text-bunker-300">
                <div className="mb-2">
                  Access List
                  <Tooltip
                    content="Lists all users, machine identities, and groups that have been granted any permission level (read, create, edit, or delete) for this secret."
                    className="z-[100]"
                  >
                    <FontAwesomeIcon icon={faCircleQuestion} className="ml-1" size="sm" />
                  </Tooltip>
                </div>
                {isPending && (
                  <Button className="w-full px-2 py-1" variant="outline_bg" isDisabled>
                    Analyze Access
                  </Button>
                )}
                {!isPending && secretAccessList === undefined && (
                  <Button
                    className="w-full px-2 py-1"
                    variant="outline_bg"
                    onClick={() => {
                      handlePopUpOpen("secretAccessUpgradePlan");
                    }}
                  >
                    Analyze Access
                  </Button>
                )}
                {!isPending && secretAccessList && (
                  <div className="flex max-h-72 flex-col space-y-2 overflow-y-auto overflow-x-hidden rounded-md border border-mineshaft-600 bg-bunker-800 p-2 dark:[color-scheme:dark]">
                    {secretAccessList.users.length > 0 && (
                      <div className="pb-3">
                        <div className="mb-2 font-bold">Users</div>
                        <div className="flex flex-wrap gap-2">
                          {secretAccessList.users.map((user) => (
                            <div className="rounded-md bg-bunker-500 px-1">
                              <Tooltip content={user.allowedActions.join(", ")} className="z-[100]">
                                <Link
                                  to={
                                    `/${ProjectType.SecretManager}/$projectId/members/$membershipId` as const
                                  }
                                  params={{
                                    projectId: currentWorkspace.id,
                                    membershipId: user.membershipId
                                  }}
                                  className="text-secondary/80 text-sm hover:text-primary"
                                >
                                  {user.name}
                                </Link>
                              </Tooltip>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {secretAccessList.identities.length > 0 && (
                      <div className="pb-3">
                        <div className="mb-2 font-bold">Identities</div>
                        <div className="flex flex-wrap gap-2">
                          {secretAccessList.identities.map((identity) => (
                            <div className="rounded-md bg-bunker-500 px-1">
                              <Tooltip
                                content={identity.allowedActions.join(", ")}
                                className="z-[100]"
                              >
                                <Link
                                  to={
                                    `/${ProjectType.SecretManager}/$projectId/identities/$identityId` as const
                                  }
                                  params={{
                                    projectId: currentWorkspace.id,
                                    identityId: identity.id
                                  }}
                                  className="text-secondary/80 text-sm hover:text-primary"
                                >
                                  {identity.name}
                                </Link>
                              </Tooltip>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {secretAccessList.groups.length > 0 && (
                      <div className="pb-3">
                        <div className="mb-2 font-bold">Groups</div>
                        <div className="flex flex-wrap gap-2">
                          {secretAccessList.groups.map((group) => (
                            <div className="rounded-md bg-bunker-500 px-1">
                              <Tooltip
                                content={group.allowedActions.join(", ")}
                                className="z-[100]"
                              >
                                <Link
                                  to={"/organization/groups/$groupId" as const}
                                  params={{
                                    groupId: group.id
                                  }}
                                  className="text-secondary/80 text-sm hover:text-primary"
                                >
                                  {group.name}
                                </Link>
                              </Tooltip>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col space-y-4">
                <div className="mb-2 flex items-center space-x-4">
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Edit}
                    a={subject(ProjectPermissionSub.Secrets, {
                      environment,
                      secretPath,
                      secretName: secretKey,
                      secretTags: selectTagSlugs
                    })}
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
                    a={subject(ProjectPermissionSub.Secrets, {
                      environment,
                      secretPath,
                      secretName: secretKey,
                      secretTags: selectTagSlugs
                    })}
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
