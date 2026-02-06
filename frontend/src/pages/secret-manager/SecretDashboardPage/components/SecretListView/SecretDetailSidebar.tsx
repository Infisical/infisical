import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import {
  faCheckCircle,
  faCopy,
  faPlus,
  faProjectDiagram,
  faSearch,
  faShare,
  faTag,
  faTrash,
  faTriangleExclamation
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretReferenceTree } from "@app/components/secrets/SecretReferenceDetails";
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
  Modal,
  ModalContent,
  Switch,
  Tag,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { getProjectBaseURL } from "@app/helpers/project";
import { usePopUp, useToggle } from "@app/hooks";
import { useGetOrgUsers, useGetSecretVersion, useRedactSecretValue } from "@app/hooks/api";
import {
  dashboardKeys,
  fetchSecretValue,
  useGetSecretValue
} from "@app/hooks/api/dashboard/queries";
import { useGetSecretAccessList } from "@app/hooks/api/secrets/queries";
import { SecretV3RawSanitized, WsTag } from "@app/hooks/api/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";
import { camelCaseToSpaces } from "@app/lib/fn/string";

import { HIDDEN_SECRET_VALUE } from "./SecretItem";
import { formSchema, SecretActionType, TFormSchema } from "./SecretListView.utils";
import { SecretVersionItem } from "./SecretVersionItem";

type Props = {
  isOpen?: boolean;
  environment: string;
  secretPath: string;
  onToggle: (isOpen: boolean) => void;
  onClose: () => void;
  secret: SecretV3RawSanitized & { originalKey?: string };
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
  secret: originalSecret,
  onDeleteSecret,
  onSaveSecret,
  tags,
  onCreateTag,
  environment,
  secretPath,
  handleSecretShare
}: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const [isFieldFocused, setIsFieldFocused] = useToggle();
  const queryClient = useQueryClient();

  const { mutateAsync: redactSecretValue } = useRedactSecretValue();

  const canFetchSecretValue =
    Boolean(originalSecret) && !originalSecret.secretValueHidden && !originalSecret.isEmpty;

  const fetchSecretValueParams = {
    environment,
    secretPath,
    secretKey: originalSecret?.originalKey || originalSecret?.key,
    projectId: currentProject.id,
    isOverride: Boolean(originalSecret?.idOverride)
  };

  const {
    data: secretValueData,
    isPending: isPendingSecretValue,
    isError: isErrorFetchingSecretValue
  } = useGetSecretValue(fetchSecretValueParams, {
    enabled: canFetchSecretValue && isFieldFocused
  });

  const isLoadingSecretValue = canFetchSecretValue && isPendingSecretValue;
  const hasFetchedSecretValue = !canFetchSecretValue || Boolean(secretValueData);

  const secret = {
    ...originalSecret,
    value: originalSecret?.value ?? secretValueData?.value,
    valueOverride: originalSecret?.valueOverride ?? secretValueData?.valueOverride
  };

  const { permission } = useProjectPermission();

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
    if (isLoadingSecretValue) return HIDDEN_SECRET_VALUE;

    if (secret.secretValueHidden) {
      return canEditSecretValue ? HIDDEN_SECRET_VALUE : "";
    }

    if (isErrorFetchingSecretValue) return "Error loading secret value...";

    return secret.value || "";
  };

  const getOverrideDefaultValue = () => {
    if (isLoadingSecretValue) return HIDDEN_SECRET_VALUE;

    if (secret.secretValueHidden) {
      return canEditSecretValue ? HIDDEN_SECRET_VALUE : "";
    }

    if (isErrorFetchingSecretValue) return "Error loading secret value...";

    return secret.valueOverride || "";
  };

  const {
    control,
    watch,
    handleSubmit,
    setValue,
    reset,
    getValues,
    getFieldState,
    formState: { isDirty }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    values: {
      ...secret,
      valueOverride: getOverrideDefaultValue(),
      value: getDefaultValue()
    },
    disabled: !secret
  });

  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp([
    "secretAccessUpgradePlan",
    "secretReferenceTree",
    "redactSecretValue"
  ] as const);

  const { data: orgMembers = [] } = useGetOrgUsers(currentOrg?.id || "");

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

  const { subscription } = useSubscription();
  const { data: secretAccessList, isPending } = useGetSecretAccessList({
    projectId: currentProject.id,
    environment,
    secretPath,
    secretKey: subscription?.secretAccessInsights ? secretKey : ""
  });

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
    await onSaveSecret(
      secret,
      {
        ...secret,
        ...data,
        value: getFieldState("value").isDirty ? data.value : undefined,
        valueOverride: getFieldState("valueOverride").isDirty ? data.valueOverride : undefined
      },
      () => reset()
    );
  };

  useEffect(() => {
    setValue(
      "reminderRecipients",
      secret?.secretReminderRecipients?.map((el) => el.user.id),
      {
        shouldDirty: false
      }
    );
  }, [secret?.secretReminderRecipients]);

  const fetchValue = async () => {
    if (secretValueData) return secretValueData.valueOverride ?? secretValueData.value;

    try {
      const data = await fetchSecretValue(fetchSecretValueParams);

      queryClient.setQueryData(dashboardKeys.getSecretValue(fetchSecretValueParams), data);

      return data?.valueOverride ?? data.value;
    } catch (error) {
      console.error(error);
      createNotification({
        type: "error",
        text: "Error fetching secret value"
      });
      throw error;
    }
  };

  return (
    <>
      <UpgradePlanModal
        isOpen={popUp.secretAccessUpgradePlan.isOpen}
        onOpenChange={(isUpgradeModalOpen) =>
          handlePopUpToggle("secretAccessUpgradePlan", isUpgradeModalOpen)
        }
        text="Secret access analysis feature can be unlocked if you upgrade to Infisical Pro plan."
      />
      <Modal
        isOpen={popUp.secretReferenceTree.isOpen}
        onOpenChange={(isSecretRefOpen) =>
          handlePopUpToggle("secretReferenceTree", isSecretRefOpen)
        }
      >
        <ModalContent
          title="Secret Reference Details"
          subTitle="Visual breakdown of secrets referenced by this secret."
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SecretReferenceTree
            secretPath={secretPath}
            environment={environment}
            secretKey={popUp.secretReferenceTree.data}
          />
        </ModalContent>
      </Modal>

      <Drawer
        onOpenChange={async (state) => {
          if (isOpen && isDirty) {
            await handleSubmit(handleFormSubmit)();
          }
          onToggle(state);
        }}
        isOpen={isOpen}
      >
        <DrawerContent
          title={`Secret – ${secret?.key}`}
          className="h-full thin-scrollbar w-md"
          cardBodyClassName="pb-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <form
            onSubmit={handleSubmit(handleFormSubmit)}
            className="flex h-full flex-1 flex-col gap-y-4"
          >
            <span className="text-sm text-bunker-300">
              Changes will automatically be applied for commit
            </span>
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
                    <FormControl
                      className="mb-0"
                      helperText={
                        cannotReadSecretValue ? (
                          <div className="flex space-x-2">
                            <FontAwesomeIcon
                              icon={faTriangleExclamation}
                              className="mt-0.5 text-yellow-400"
                            />
                            <span>
                              The value of this secret is hidden because you do not have the read
                              secret value permission.
                            </span>
                          </div>
                        ) : undefined
                      }
                      label="Value"
                    >
                      <div className="flex items-start gap-x-2">
                        <InfisicalSecretInput
                          isReadOnly={
                            isReadOnly ||
                            !isAllowed ||
                            secret?.isRotatedSecret ||
                            isLoadingSecretValue ||
                            isErrorFetchingSecretValue
                          }
                          canEditButNotView={secret.secretValueHidden && canEditSecretValue}
                          environment={environment}
                          secretPath={secretPath}
                          key="secret-value"
                          isDisabled={isOverridden}
                          containerClassName="text-bunker-300 w-full hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
                          {...field}
                          autoFocus={false}
                          onFocus={() => setIsFieldFocused.on()}
                          onBlur={() => {
                            setIsFieldFocused.off();
                            field.onBlur();
                          }}
                        />
                        <Tooltip
                          content={
                            !currentProject.secretSharing
                              ? "This project does not allow secret sharing."
                              : "You don't have permission to view the secret value."
                          }
                          isDisabled={!secret?.secretValueHidden && currentProject.secretSharing}
                        >
                          <Button
                            isDisabled={secret?.secretValueHidden || !currentProject.secretSharing}
                            className="px-2 py-[0.43rem] font-normal"
                            variant="outline_bg"
                            leftIcon={<FontAwesomeIcon icon={faShare} />}
                            onClick={async () => {
                              let value: string | undefined;

                              if (hasFetchedSecretValue) {
                                const values = getValues(["value", "valueOverride"]);
                                value = secret.idOverride ? values[1] : values[0];
                              } else {
                                value = await fetchValue();
                              }

                              handleSecretShare(value ?? "");
                            }}
                          >
                            Share
                          </Button>
                        </Tooltip>
                      </div>
                    </FormControl>
                  )}
                />
              )}
            </ProjectPermissionCan>
            <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4">
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
                            className="z-100"
                          >
                            <FontAwesomeIcon icon={faCircleQuestion} className="ml-2" />
                          </Tooltip>
                        </span>
                        <Switch
                          id="skipmultiencoding-option"
                          onCheckedChange={(isChecked) => onChange(isChecked)}
                          isChecked={value ?? false}
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
            <div className="flex flex-col rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 px-0 pb-0">
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
                      className={`flex flex-wrap gap-2 overflow-hidden ${tagFields.fields.length > 0 ? "pt-2" : ""}`}
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
                        <DropdownMenuContent align="start" side="right" className="z-100">
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
                        <div className="grow">
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
                        <div className="grow">
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
                        <div>
                          {i === 0 && (
                            <FormLabel label="Encrypt" className="text-xs text-mineshaft-400" />
                          )}
                          <Controller
                            control={control}
                            defaultValue={
                              currentProject.enforceEncryptedSecretManagerSecretMetadata
                            }
                            name={`secretMetadata.${i}.isEncrypted`}
                            render={({ field, fieldState: { error } }) => (
                              <FormControl
                                isError={Boolean(error?.message)}
                                errorText={error?.message}
                                className="mb-0 w-12"
                              >
                                <Switch
                                  id="metadata-is-encrypted-checkbox"
                                  isChecked={field.value}
                                  defaultChecked={field.value}
                                  onCheckedChange={field.onChange}
                                  className="mt-1.5 mb-2 ml-1"
                                />
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
                        onClick={() =>
                          metadataFormFields.append({ key: "", value: "", isEncrypted: false })
                        }
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
                  className="mb-0 h-[125px] pb-0"
                >
                  <TextArea
                    className="mb-0 resize-none! border border-mineshaft-600 bg-mineshaft-900 text-sm"
                    readOnly={isReadOnly}
                    placeholder="add a comment or note to this secret..."
                    rows={4}
                    {...field}
                  />
                </FormControl>
              )}
            />
            <div className="dark flex max-h-96 flex-1 cursor-default flex-col text-sm text-bunker-300">
              <div className="mb-0.5 text-mineshaft-400">Version History</div>
              <div className="flex thin-scrollbar flex-1 flex-col space-y-2 overflow-x-hidden overflow-y-auto rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 dark:scheme-dark">
                {secretVersion?.map((version) => (
                  <SecretVersionItem
                    orgMembers={orgMembers}
                    canReadValue={!cannotReadSecretValue}
                    secretVersion={version}
                    secret={secret}
                    currentVersion={secretVersion.length}
                    onReactSecretValue={async (versionId) => {
                      await redactSecretValue({ versionId, secretId: secret.id });

                      createNotification({
                        title: "Secret value redacted",
                        text: "The secret value has been redacted successfully and is no longer persisted or viewable.",
                        type: "success"
                      });
                    }}
                    canEditSecret={!cannotEditSecret}
                    onRevert={async (versionValue) => {
                      await fetchValue();

                      setTimeout(() => {
                        setValue("value", versionValue, { shouldDirty: true });
                      }, 5);
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="dark flex flex-col text-sm text-bunker-300">
              <div className="mb-0.5 text-mineshaft-400">
                Access List
                <Tooltip
                  content="Lists all users, machine identities, and groups that have been granted any permission level (read, create, edit, or delete) for this secret."
                  className="z-100"
                >
                  <FontAwesomeIcon icon={faCircleQuestion} className="ml-2" />
                </Tooltip>
              </div>
              {secretAccessList ? (
                <div className="flex flex-col space-y-2 overflow-x-hidden overflow-y-auto rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 dark:scheme-dark">
                  {secretAccessList.users.length > 0 && (
                    <div className="pb-3">
                      <div className="mb-2 font-bold">Users</div>
                      <div className="flex flex-wrap gap-2">
                        {secretAccessList.users.map((user) => (
                          <div className="rounded-md bg-bunker-500">
                            <Tooltip
                              side="left"
                              content={user.allowedActions
                                .map((action) => camelCaseToSpaces(action))
                                .join(", ")}
                              className="z-100 capitalize"
                            >
                              <div className="text-secondary/80 rounded-md border border-mineshaft-600 bg-mineshaft-700 px-1 py-0.5 text-sm hover:text-mineshaft-100">
                                {user.name}
                              </div>
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
                              side="left"
                              content={identity.allowedActions
                                .map(
                                  (action) =>
                                    action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()
                                )
                                .join(", ")}
                              className="z-100"
                            >
                              <Link
                                to={
                                  `${getProjectBaseURL(currentProject.type)}/identities/$identityId` as const
                                }
                                params={{
                                  orgId: currentOrg.id,
                                  projectId: currentProject.id,
                                  identityId: identity.id
                                }}
                                className="text-secondary/80 rounded-md border border-mineshaft-600 bg-mineshaft-700 px-1 py-0.5 text-sm hover:text-mineshaft-100"
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
                              side="left"
                              content={group.allowedActions
                                .map(
                                  (action) =>
                                    action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()
                                )
                                .join(", ")}
                              className="z-100"
                            >
                              <Link
                                to={"/organizations/$orgId/groups/$groupId" as const}
                                params={{
                                  orgId: currentOrg.id,
                                  groupId: group.id
                                }}
                                className="text-secondary/80 rounded-md border border-mineshaft-600 bg-mineshaft-700 px-1 py-0.5 text-sm hover:text-mineshaft-100"
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
              ) : (
                <Button
                  className="w-full"
                  leftIcon={<FontAwesomeIcon icon={faSearch} />}
                  variant="outline_bg"
                  isDisabled={isPending}
                  isLoading={isPending}
                  onClick={() => handlePopUpOpen("secretAccessUpgradePlan")}
                >
                  Analyze Access
                </Button>
              )}
            </div>
            <div className="mt-auto flex items-center space-x-2 pb-4">
              <Button
                className="flex-1"
                variant="outline_bg"
                isDisabled={cannotReadSecretValue || secret.isEmpty}
                leftIcon={<FontAwesomeIcon icon={faProjectDiagram} />}
                onClick={() => handlePopUpOpen("secretReferenceTree", secretKey)}
              >
                Secret Reference Tree
              </Button>
              <Tooltip content="Copy Secret ID" className="z-100">
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
                  <Tooltip content="Delete Secret" align="end" className="z-100">
                    <IconButton
                      colorSchema="danger"
                      variant="outline_bg"
                      ariaLabel="Delete Secret"
                      className="h-min border border-mineshaft-600 bg-mineshaft-700 hover:border-red-500/70 hover:bg-red-600/20"
                      isDisabled={!isAllowed}
                      onClick={onDeleteSecret}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </IconButton>
                  </Tooltip>
                )}
              </ProjectPermissionCan>
            </div>
          </form>
        </DrawerContent>
      </Drawer>
    </>
  );
};
