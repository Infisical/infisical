import { useEffect, useMemo } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faCircleQuestion, faEye } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowRotateRight,
  faCheckCircle,
  faClock,
  faCopy,
  faDesktop,
  faEyeSlash,
  faPlus,
  faServer,
  faShare,
  faTag,
  faTrash,
  faTriangleExclamation,
  faUser
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

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
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { getProjectBaseURL } from "@app/helpers/project";
import { usePopUp, useToggle } from "@app/hooks";
import { useGetSecretVersion } from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { useGetReminder } from "@app/hooks/api/reminders";
import { useGetSecretAccessList } from "@app/hooks/api/secrets/queries";
import { SecretV3RawSanitized, WsTag } from "@app/hooks/api/types";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";
import { camelCaseToSpaces } from "@app/lib/fn/string";

import { CreateReminderForm } from "./CreateReminderForm";
import { HIDDEN_SECRET_VALUE } from "./SecretItem";
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
    control,
    watch,
    handleSubmit,
    setValue,
    reset,
    formState: { isDirty, isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    values: secret,
    disabled: !secret
  });

  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp([
    "secretAccessUpgradePlan"
  ] as const);

  const { permission } = useProjectPermission();
  const { currentWorkspace } = useWorkspace();
  const { data: reminderData } = useGetReminder(secret?.id);

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
  const navigate = useNavigate();

  const cannotEditSecret = permission.cannot(
    ProjectPermissionSecretActions.Edit,
    subject(ProjectPermissionSub.Secrets, {
      environment,
      secretPath,
      secretName: secretKey,
      secretTags: selectTagSlugs
    })
  );

  const cannotReadSecretValue = !hasSecretReadValueOrDescribePermission(
    permission,
    ProjectPermissionSecretActions.ReadValue,
    {
      environment,
      secretPath,
      secretName: secretKey,
      secretTags: selectTagSlugs
    }
  );

  const isReadOnly =
    hasSecretReadValueOrDescribePermission(
      permission,
      ProjectPermissionSecretActions.DescribeSecret,
      {
        environment,
        secretPath,
        secretName: secretKey,
        secretTags: selectTagSlugs
      }
    ) &&
    cannotEditSecret &&
    cannotReadSecretValue;

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

  useEffect(() => {
    setValue(
      "reminderRecipients",
      secret?.secretReminderRecipients?.map((el) => el.user.id),
      {
        shouldDirty: false
      }
    );
  }, [secret?.secretReminderRecipients]);

  const getModifiedByIcon = (userType: string | undefined | null) => {
    switch (userType) {
      case ActorType.USER:
        return faUser;
      case ActorType.IDENTITY:
        return faDesktop;
      default:
        return faServer;
    }
  };

  const getModifiedByName = (
    userType: string | undefined | null,
    userName: string | null | undefined
  ) => {
    switch (userType) {
      case ActorType.PLATFORM:
        return "System-generated";
      case ActorType.IDENTITY:
        return userName || "Deleted Identity";
      case ActorType.USER:
        return userName || "Deleted User";
      default:
        return "Unknown";
    }
  };

  const getLinkToModifyHistoryEntity = (
    actorId: string,
    actorType: string,
    membershipId: string | null = ""
  ) => {
    switch (actorType) {
      case ActorType.USER:
        return `/${ProjectType.SecretManager}/${currentWorkspace.id}/members/${membershipId}`;
      case ActorType.IDENTITY:
        return `/${ProjectType.SecretManager}/${currentWorkspace.id}/identities/${actorId}`;
      default:
        return null;
    }
  };

  const onModifyHistoryClick = (
    actorId: string | undefined | null,
    actorType: string | undefined | null,
    membershipId: string | undefined | null
  ) => {
    if (actorType && actorId && actorType !== ActorType.PLATFORM) {
      const redirectLink = getLinkToModifyHistoryEntity(actorId, actorType, membershipId);
      if (redirectLink) {
        navigate({ to: redirectLink });
      }
    }
  };

  const getDaysUntilReminder = useMemo(() => {
    return (): string => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const target = new Date(reminderData?.nextReminderDate || "");
      target.setHours(0, 0, 0, 0);

      const diffTime = target.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return `Days until next reminder: ${daysRemaining}`;
    };
  }, [reminderData]);

  return (
    <>
      <CreateReminderForm
        isOpen={createReminderFormOpen}
        onOpenChange={() => {
          setCreateReminderFormOpen.toggle();
        }}
        workspaceId={currentWorkspace.id}
        environment={environment}
        secretPath={secretPath}
        secretId={secret?.id}
        reminder={reminderData}
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
                          <div className="flex items-center gap-2">
                            <FormControl
                              className="flex-1"
                              helperText={
                                cannotReadSecretValue ? (
                                  <div className="flex space-x-2">
                                    <FontAwesomeIcon
                                      icon={faTriangleExclamation}
                                      className="mt-0.5 text-yellow-400"
                                    />
                                    <span>
                                      The value of this secret is hidden because you do not have the
                                      read secret value permission.
                                    </span>
                                  </div>
                                ) : undefined
                              }
                              label="Value"
                            >
                              <div className="flex items-center gap-2">
                                <InfisicalSecretInput
                                  isReadOnly={isReadOnly || !isAllowed || secret?.isRotatedSecret}
                                  environment={environment}
                                  secretPath={secretPath}
                                  key="secret-value"
                                  isDisabled={isOverridden}
                                  containerClassName="text-bunker-300 w-full hover:border-primary-400/50 border border-mineshaft-600 bg-bunker-800 px-2 py-1.5"
                                  {...field}
                                  autoFocus={false}
                                />
                                <Tooltip
                                  content={
                                    !currentWorkspace.secretSharing
                                      ? "This project does not allow secret sharing."
                                      : "You don't have permission to view the secret value."
                                  }
                                  isDisabled={
                                    !secret?.secretValueHidden && currentWorkspace.secretSharing
                                  }
                                >
                                  <Button
                                    isDisabled={
                                      secret?.secretValueHidden || !currentWorkspace.secretSharing
                                    }
                                    className="px-2 py-[0.43rem] font-normal"
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
                                </Tooltip>
                              </div>
                            </FormControl>
                          </div>
                        )}
                      />
                    )}
                  </ProjectPermissionCan>
                </div>
              </div>
              <div className="mb-2 rounded border border-mineshaft-600 bg-mineshaft-900 p-4 px-0 pb-0">
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
                            <span className="w-max text-sm text-mineshaft-300">
                              Multi-line encoding
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
                            />
                          </div>
                        )}
                      </ProjectPermissionCan>
                    )}
                  />
                </div>
                <div
                  className={`mb-4 w-full border-t border-mineshaft-600 ${isOverridden ? "block" : "hidden"}`}
                />
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
                    <div className="flex items-center justify-between px-4 pb-4">
                      <span className="w-max text-sm text-mineshaft-300">
                        Override with a personal value
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
                      />
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
              <div className="mb-4 mt-2 flex flex-col rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 px-0 pb-0">
                <div
                  className={`flex justify-between px-4 text-mineshaft-100 ${tagFields.fields.length > 0 ? "flex-col" : "flex-row"}`}
                >
                  <div
                    className={`text-sm text-mineshaft-300 ${tagFields.fields.length > 0 ? "mb-2" : "mt-0.5"}`}
                  >
                    Tags
                  </div>
                  <div>
                    <FormControl>
                      <div
                        className={`grid auto-cols-min grid-flow-col gap-2 overflow-hidden ${tagFields.fields.length > 0 ? "pt-2" : ""}`}
                      >
                        {tagFields.fields.map(({ tagColor, id: formId, slug }) => (
                          <Tag
                            className="flex w-min items-center space-x-2"
                            key={formId}
                            onClose={() => {
                              if (cannotEditSecret) {
                                createNotification({ type: "error", text: "Access denied" });
                                return;
                              }

                              const tag = tags?.find(({ slug: tagSlug }) => slug === tagSlug);
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
                            <DropdownMenuLabel className="pl-2">
                              Add tags to this secret
                            </DropdownMenuLabel>
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
                <div
                  className={`mb-4 w-full border-t border-mineshaft-600 ${tagFields.fields.length > 0 || metadataFormFields.fields.length > 0 ? "block" : "hidden"}`}
                />

                <div
                  className={`flex justify-between px-4 text-mineshaft-100 ${metadataFormFields.fields.length > 0 ? "flex-col" : "flex-row"}`}
                >
                  <div
                    className={`text-sm text-mineshaft-300 ${metadataFormFields.fields.length > 0 ? "mb-2" : "mt-0.5"}`}
                  >
                    Metadata
                  </div>
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
                        <IconButton
                          ariaLabel="Add Key"
                          variant="outline_bg"
                          size="xs"
                          className="rounded-md"
                          onClick={() => metadataFormFields.append({ key: "", value: "" })}
                        >
                          <FontAwesomeIcon icon={faPlus} />
                        </IconButton>
                      </div>
                    </div>
                  </FormControl>
                </div>
              </div>
              <Controller
                control={control}
                name="comment"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Comments & Notes"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    className="mb-0"
                  >
                    <TextArea
                      className="border border-mineshaft-600 bg-bunker-800 text-sm"
                      readOnly={isReadOnly}
                      rows={5}
                      {...field}
                    />
                  </FormControl>
                )}
              />
              <FormControl>
                {reminderData && reminderData.nextReminderDate ? (
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center space-x-2">
                      <FontAwesomeIcon className="text-primary-500" icon={faClock} />
                      <span className="text-sm text-bunker-300">{getDaysUntilReminder()}</span>
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
              <div className="mb-4flex-grow dark cursor-default text-sm text-bunker-300">
                <div className="mb-2 pl-1">Version History</div>
                <div className="thin-scrollbar flex h-48 flex-col space-y-2 overflow-y-auto overflow-x-hidden rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 dark:[color-scheme:dark]">
                  {secretVersion?.map(
                    ({ createdAt, secretValue, secretValueHidden, version, id, actor }) => (
                      <div className="flex flex-row" key={id}>
                        <div className="flex w-full flex-col space-y-1">
                          <div className="flex items-center">
                            <div className="w-10">
                              <div className="w-fit rounded-md border border-mineshaft-600 bg-mineshaft-700 px-1 text-sm text-mineshaft-300">
                                v{version}
                              </div>
                            </div>
                            <div>{format(new Date(createdAt), "Pp")}</div>
                          </div>
                          <div className="flex w-full cursor-default">
                            <div className="relative w-10">
                              <div className="absolute bottom-0 left-3 top-0 mt-0.5 border-l border-mineshaft-400/60" />
                            </div>
                            <div className="flex w-full cursor-default flex-col">
                              {actor && (
                                <div className="flex flex-row">
                                  <div className="flex w-fit flex-row text-sm">
                                    Modified by:
                                    <Tooltip
                                      content={getModifiedByName(actor.actorType, actor.name)}
                                    >
                                      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                                      <div
                                        onClick={() =>
                                          onModifyHistoryClick(
                                            actor.actorId,
                                            actor.actorType,
                                            actor.membershipId
                                          )
                                        }
                                        className="cursor-pointer"
                                      >
                                        <FontAwesomeIcon
                                          icon={getModifiedByIcon(actor.actorType)}
                                          className="ml-2"
                                        />
                                      </div>
                                    </Tooltip>
                                  </div>
                                </div>
                              )}
                              <div className="flex flex-row">
                                <div className="h-min w-fit rounded-sm bg-primary-500/10 px-1 text-primary-300/70">
                                  Value:
                                </div>
                                <div className="group break-all pl-1 font-mono">
                                  <div className="relative hidden cursor-pointer transition-all duration-200 group-[.show-value]:inline">
                                    <button
                                      type="button"
                                      className="select-none text-left"
                                      onClick={(e) => {
                                        if (secretValueHidden) return;

                                        navigator.clipboard.writeText(secretValue || "");
                                        const target = e.currentTarget;
                                        target.style.borderBottom = "1px dashed";
                                        target.style.paddingBottom = "-1px";

                                        // Create and insert popup
                                        const popup = document.createElement("div");
                                        popup.className =
                                          "w-16 flex justify-center absolute top-6 left-0 text-xs text-primary-100 bg-mineshaft-800 px-1 py-0.5 rounded-md border border-primary-500/50";
                                        popup.textContent = "Copied!";
                                        target.parentElement?.appendChild(popup);

                                        // Remove popup and border after delay
                                        setTimeout(() => {
                                          popup.remove();
                                          target.style.borderBottom = "none";
                                        }, 3000);
                                      }}
                                      onKeyDown={(e) => {
                                        if (secretValueHidden) return;

                                        if (e.key === "Enter" || e.key === " ") {
                                          navigator.clipboard.writeText(secretValue || "");
                                          const target = e.currentTarget;
                                          target.style.borderBottom = "1px dashed";
                                          target.style.paddingBottom = "-1px";

                                          // Create and insert popup
                                          const popup = document.createElement("div");
                                          popup.className =
                                            "w-16 flex justify-center absolute top-6 left-0 text-xs text-primary-100 bg-mineshaft-800 px-1 py-0.5 rounded-md border border-primary-500/50";
                                          popup.textContent = "Copied!";
                                          target.parentElement?.appendChild(popup);

                                          // Remove popup and border after delay
                                          setTimeout(() => {
                                            popup.remove();
                                            target.style.borderBottom = "none";
                                          }, 3000);
                                        }
                                      }}
                                    >
                                      <span
                                        className={twMerge(
                                          secretValueHidden && "text-xs text-bunker-300 opacity-40"
                                        )}
                                      >
                                        {secretValueHidden ? "Hidden" : secretValue}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      className="ml-1 cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        e.currentTarget
                                          .closest(".group")
                                          ?.classList.remove("show-value");
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.stopPropagation();
                                          e.currentTarget
                                            .closest(".group")
                                            ?.classList.remove("show-value");
                                        }
                                      }}
                                    >
                                      <FontAwesomeIcon icon={faEyeSlash} />
                                    </button>
                                  </div>
                                  <span className="group-[.show-value]:hidden">
                                    {secretValueHidden
                                      ? HIDDEN_SECRET_VALUE
                                      : secretValue?.replace(/./g, "*")}
                                    <button
                                      type="button"
                                      className="ml-1 cursor-pointer"
                                      onClick={(e) => {
                                        e.currentTarget
                                          .closest(".group")
                                          ?.classList.add("show-value");
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.currentTarget
                                            .closest(".group")
                                            ?.classList.add("show-value");
                                        }
                                      }}
                                    >
                                      <FontAwesomeIcon icon={faEye} />
                                    </button>
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        {!secret?.isRotatedSecret && (
                          <div
                            className={`flex items-center justify-center ${version === secretVersion.length ? "hidden" : ""}`}
                          >
                            <Tooltip content="Restore Secret Value">
                              <IconButton
                                ariaLabel="Restore"
                                variant="outline_bg"
                                size="sm"
                                className="h-8 w-8 rounded-md"
                                onClick={() =>
                                  setValue("value", secretValue, { shouldDirty: true })
                                }
                              >
                                <FontAwesomeIcon icon={faArrowRotateRight} />
                              </IconButton>
                            </Tooltip>
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
              <div className="dark mb-4 flex-grow text-sm text-bunker-300">
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
                  <div className="mb-4 flex max-h-72 flex-col space-y-2 overflow-y-auto overflow-x-hidden rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 dark:[color-scheme:dark]">
                    {secretAccessList.users.length > 0 && (
                      <div className="pb-3">
                        <div className="mb-2 font-bold">Users</div>
                        <div className="flex flex-wrap gap-2">
                          {secretAccessList.users.map((user) => (
                            <div className="rounded-md bg-bunker-500">
                              <Tooltip
                                content={user.allowedActions
                                  .map((action) => camelCaseToSpaces(action))
                                  .join(", ")}
                                className="z-[100] capitalize"
                              >
                                <Link
                                  to={
                                    `${getProjectBaseURL(currentWorkspace.type)}/members/$membershipId` as const
                                  }
                                  params={{
                                    projectId: currentWorkspace.id,
                                    membershipId: user.membershipId
                                  }}
                                  className="text-secondary/80 rounded-md border border-mineshaft-600 bg-mineshaft-700 px-1 py-0.5 text-sm hover:text-primary"
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
                              <Tooltip
                                content={identity.allowedActions
                                  .map(
                                    (action) =>
                                      action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()
                                  )
                                  .join(", ")}
                                className="z-[100]"
                              >
                                <Link
                                  to={
                                    `${getProjectBaseURL(currentWorkspace.type)}/identities/$identityId` as const
                                  }
                                  params={{
                                    projectId: currentWorkspace.id,
                                    identityId: identity.id
                                  }}
                                  className="text-secondary/80 rounded-md border border-mineshaft-600 bg-mineshaft-700 px-1 py-0.5 text-sm hover:text-primary"
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
                              <Tooltip
                                content={group.allowedActions
                                  .map(
                                    (action) =>
                                      action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()
                                  )
                                  .join(", ")}
                                className="z-[100]"
                              >
                                <Link
                                  to={"/organization/groups/$groupId" as const}
                                  params={{
                                    groupId: group.id
                                  }}
                                  className="text-secondary/80 rounded-md border border-mineshaft-600 bg-mineshaft-700 px-1 py-0.5 text-sm hover:text-primary"
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
                        Apply Changes
                      </Button>
                    )}
                  </ProjectPermissionCan>
                  <div className="flex items-center gap-2">
                    <Tooltip content="Copy Secret ID">
                      <IconButton
                        variant="outline_bg"
                        ariaLabel="Copy Secret ID"
                        onClick={async () => {
                          await navigator.clipboard.writeText(secret.id);

                          createNotification({
                            title: "Secret ID Copied",
                            text: "The secret ID has been copied to your clipboard.",
                            type: "success"
                          });
                        }}
                      >
                        <FontAwesomeIcon icon={faCopy} />
                      </IconButton>
                    </Tooltip>
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
                        <Tooltip content="Delete Secret">
                          <IconButton
                            colorSchema="danger"
                            variant="outline_bg"
                            ariaLabel="Delete Secret"
                            className="border border-mineshaft-600 bg-mineshaft-700 hover:border-red-500/70 hover:bg-red-600/20"
                            isDisabled={!isAllowed}
                            onClick={onDeleteSecret}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </ProjectPermissionCan>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </DrawerContent>
      </Drawer>
    </>
  );
};
