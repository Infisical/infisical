import { Controller, useFieldArray, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faCircleQuestion, faEye } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowRotateRight,
  faCheckCircle,
  faClock,
  faEyeSlash,
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
        <DrawerContent title={`Secret – ${secret?.key}`} className="thin-scrollbar">
          <form onSubmit={handleSubmit(handleFormSubmit)} className="h-full">
            <div className="flex h-full flex-col">
              <div className="flex flex-row">
                <div className="w-full">
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
                              containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-bunker-800 px-2 py-1.5"
                              {...field}
                              autoFocus={false}
                            />
                          </FormControl>
                        )}
                      />
                    )}
                  </ProjectPermissionCan>
                </div>
                <div className="ml-1 mt-1.5 flex items-center">
                  <Button
                    className="w-full px-2 py-[0.43rem] font-normal"
                    variant="outline_bg"
                    leftIcon={<FontAwesomeIcon icon={faShare} />}
                    onClick={() => {
                      const value = secret?.valueOverride ?? secret?.value;
                      if (value) {
                        handleSecretShare(value);
                      }
                    }}
                  >
                    Share
                  </Button>
                </div>
              </div>
              <div className="mb-2 p-4 px-0 border rounded border-mineshaft-600 bg-mineshaft-900 pb-0">
                <div className="mb-4 px-4">
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
                          <div className="flex items-center justify-between">
                            <span className="w-max text-mineshaft-300 text-sm">Multi-line encoding
                              <Tooltip
                                content="When enabled, multiline secrets will be handled by escaping newlines and enclosing the entire value in double quotes."
                                className="z-[100]"
                              >
                                <FontAwesomeIcon icon={faCircleQuestion} className="ml-2" />
                              </Tooltip>
                            </span>
                            <Switch
                              id="skipmultiencoding-option"
                              onCheckedChange={(isChecked) => onChange(isChecked)}
                              isChecked={value}
                              onBlur={onBlur}
                              isDisabled={!isAllowed}
                              className="items-center justify-between"
                            >
                            </Switch>
                          </div>
                        )}
                      </ProjectPermissionCan>
                    )}
                  />
                </div>
                <div className={`w-full border-t border-mineshaft-600 mb-4 ${isOverridden ? "block" : "hidden"}`}></div>
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

                    <div className="flex items-center justify-between pb-4 px-4">
                      <span className="w-max text-mineshaft-300 text-sm">Override with a personal value 
                        <Tooltip
                          content="Override the secret value with a personal value that does not get shared with other users and machines."
                          className="z-[100]"
                        >
                          <FontAwesomeIcon icon={faCircleQuestion} className="ml-2" />
                        </Tooltip>
                      </span>
                      <Switch
                        isDisabled={!isAllowed}
                        id="personal-override"
                        onCheckedChange={handleOverrideClick}
                        isChecked={isOverridden}
                        className="justify-start"
                      >
                      </Switch>
                    </div>
                  )}
                </ProjectPermissionCan>
                {isOverridden && (
                  <Controller
                    name="valueOverride"
                    control={control}
                    render={({ field }) => (
                      <FormControl label="Override Value" className="px-4">
                        <InfisicalSecretInput
                          isReadOnly={isReadOnly}
                          environment={environment}
                          secretPath={secretPath}
                          containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-bunker-800 px-2 py-1.5"
                          {...field}
                        />
                      </FormControl>
                    )}
                  />
                )}
              </div>
              <div className="flex flex-col bg-mineshaft-900 rounded-md p-4 px-0 pb-0 mb-4 mt-2 border border-mineshaft-600">
                <div className={`flex justify-between text-mineshaft-100 px-4 ${tagFields.fields.length > 0 ? "flex-col " : "flex-row "}`}>
                  <div className={`text-sm text-mineshaft-300 ${tagFields.fields.length > 0 ? "mb-2" : "mt-0.5"}`}>Tags</div>
                  <div>
                    <FormControl>
                      <div className={`grid auto-cols-min grid-flow-col gap-2 overflow-hidden ${tagFields.fields.length > 0 ? "pt-2" : ""}`}>
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
                          <DropdownMenuContent align="start" side="right" className="z-[100]">
                            <DropdownMenuLabel className="pl-2">Add tags to this secret</DropdownMenuLabel>
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
                                <div className="p-2">
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
                                </div>
                              )}
                            </ProjectPermissionCan>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </FormControl>
                  </div>
                </div>
                <div className={`w-full border-t border-mineshaft-600 mb-4 ${tagFields.fields.length > 0 || metadataFormFields.fields.length > 0 ? "block" : "hidden"}`}></div>
                <div className={`flex justify-between text-mineshaft-100 px-4 ${metadataFormFields.fields.length > 0 ? "flex-col " : "flex-row "}`}>
                  <div className={`text-sm text-mineshaft-300 ${metadataFormFields.fields.length > 0 ? "mb-2" : "mt-0.5"}`}>Metadata</div>
                  <FormControl>
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
                      <div className={`${metadataFormFields.fields.length > 0 ? "pt-2" : ""}`}>
                        <IconButton ariaLabel="Add Key" variant="outline_bg" size="xs" className="rounded-md" onClick={() => metadataFormFields.append({ key: "", value: "" })}>
                          <FontAwesomeIcon icon={faPlus} />
                        </IconButton>
                      </div>
                    </div>
                  </FormControl>
                </div>
              </div>
              <FormControl label="Comments & Notes">
                <TextArea
                  className="border border-mineshaft-600 text-sm bg-bunker-800"
                  {...register("comment")}
                  readOnly={isReadOnly}
                  rows={5}
                />
              </FormControl>
              <FormControl>
                {secretReminderRepeatDays && secretReminderRepeatDays > 0 ? (
                  <div className="px-2 flex items-center justify-between">
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
                  <div className="ml-1 flex items-center space-x-2">
                    <Button
                      className="w-full px-2 py-2 font-normal"
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
              <div className="dark mb-4flex-grow text-sm text-bunker-300 cursor-default">
                <div className="mb-2 pl-1">Version History</div>
                <div className="flex h-48 flex-col space-y-2 overflow-y-auto thin-scrollbar overflow-x-hidden rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 dark:[color-scheme:dark]">
                  {secretVersion?.map(({ createdAt, secretValue, version, id }) => (
                    <div className="flex flex-row">
                      <div key={id} className="flex flex-col space-y-1 w-full">
                        <div className="flex items-center">
                          <div className="w-10">
                            <div className="text-mineshaft-300 text-sm bg-mineshaft-700 border border-mineshaft-600 rounded-md px-1 w-fit">
                              v{version}
                            </div>
                          </div>
                          <div>{format(new Date(createdAt), "Pp")}</div>
                        </div>
                        <div className="flex w-full cursor-default">
                          <div className="w-10 relative">
                            <div className="absolute left-3 top-0 bottom-0 border-l mt-0.5 border-mineshaft-400/60"></div>
                          </div>
                          <div className="flex flex-row">
                            <div className="rounded-sm bg-primary-500/10 text-primary-300/70 px-1 w-fit h-min">Value:</div>
                            <div className="pl-1 break-all font-mono group">
                            <div className="hidden group-[.show-value]:inline transition-all duration-200 cursor-pointer relative">
                                <span 
                                  className="select-none" 
                                  onClick={(e) => {
                                    navigator.clipboard.writeText(secretValue || '');
                                    const target = e.currentTarget;
                                    target.style.borderBottom = '1px dashed';
                                    target.style.paddingBottom = '-1px';
                                    
                                    // Create and insert popup
                                    const popup = document.createElement('div');
                                    popup.className = 'w-16 flex justify-center absolute top-6 left-0 text-xs text-primary-100 bg-mineshaft-800 px-1 py-0.5 rounded-md border border-primary-500/50';
                                    popup.textContent = 'Copied!';
                                    target.parentElement?.appendChild(popup);
                                    
                                    // Remove popup and border after delay
                                    setTimeout(() => {
                                      popup.remove();
                                      target.style.borderBottom = 'none';
                                    }, 3000);
                                  }}
                                >
                                  {secretValue}
                                </span>
                                <FontAwesomeIcon 
                                  icon={faEyeSlash} 
                                  className="ml-1 cursor-pointer" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.currentTarget.closest('.group')?.classList.remove('show-value');
                                  }}
                                />
                              </div>
                              <span className="group-[.show-value]:hidden">
                                {secretValue?.replace(/./g, '*')}
                                <FontAwesomeIcon 
                                  icon={faEye} 
                                  className="ml-1 cursor-pointer" 
                                  onClick={(e) => {
                                    e.currentTarget.closest('.group')?.classList.add('show-value');
                                  }}
                                />
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className={`flex items-center justify-center ${version === secretVersion.length ? "hidden" : ""}`}>
                        <Tooltip content="Restore Secret Value">
                          <IconButton ariaLabel="Restore" variant="outline_bg" size="sm" className="rounded-md h-8 w-8" onClick={() => setValue(
                            "value", secretValue)}>
                            <FontAwesomeIcon icon={faArrowRotateRight} />
                          </IconButton>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="dark flex-grow text-sm text-bunker-300">
                <div className="mb-2 mt-4">
                  Access List
                  <Tooltip
                    content="Lists all users, machine identities, and groups that have been granted any permission level (read, create, edit, or delete) for this secret."
                    className="z-[100]"
                  >
                    <FontAwesomeIcon icon={faCircleQuestion} className="ml-2" />
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
                  <div className="flex max-h-72 mb-4 flex-col space-y-2 overflow-y-auto overflow-x-hidden rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 dark:[color-scheme:dark]">
                    {secretAccessList.users.length > 0 && (
                      <div className="pb-3">
                        <div className="mb-2 font-bold">Users</div>
                        <div className="flex flex-wrap gap-2">
                          {secretAccessList.users.map((user) => (
                            <div className="rounded-md bg-bunker-500">
                              <Tooltip content={user.allowedActions.map(action => action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()).join(", ")} className="z-[100]">
                                <Link
                                  to={
                                    `/${ProjectType.SecretManager}/$projectId/members/$membershipId` as const
                                  }
                                  params={{
                                    projectId: currentWorkspace.id,
                                    membershipId: user.membershipId
                                  }}
                                  className="text-secondary/80 bg-mineshaft-700 border border-mineshaft-600 rounded-md px-1 py-0.5 text-sm hover:text-primary"
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
                            <div className="rounded-md bg-bunker-500">
                              <Tooltip content={identity.allowedActions.map(action => action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()).join(", ")} className="z-[100]">
                                <Link
                                  to={
                                    `/${ProjectType.SecretManager}/$projectId/identities/$identityId` as const
                                  }
                                  params={{
                                    projectId: currentWorkspace.id,
                                    identityId: identity.id
                                  }}
                                  className="text-secondary/80 bg-mineshaft-700 border border-mineshaft-600 rounded-md px-1 py-0.5 text-sm hover:text-primary"
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
                            <div className="rounded-md bg-bunker-500">
                              <Tooltip content={group.allowedActions.map(action => action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()).join(", ")} className="z-[100]">
                                <Link
                                  to={"/organization/groups/$groupId" as const}
                                  params={{
                                    groupId: group.id
                                  }}
                                  className="text-secondary/80 bg-mineshaft-700 border border-mineshaft-600 rounded-md px-1 py-0.5 text-sm hover:text-primary"
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
                <div className="mb-4 flex items-center space-x-4">
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
                        variant="outline_bg"
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
                      <IconButton colorSchema="danger" ariaLabel="Delete Secret" className="bg-mineshaft-700 border border-mineshaft-600 hover:bg-red-600/20 hover:border-red-500/70" isDisabled={!isAllowed} onClick={onDeleteSecret}>
                        <Tooltip content="Delete Secret"><FontAwesomeIcon icon={faTrash} /></Tooltip>
                      </IconButton>
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
