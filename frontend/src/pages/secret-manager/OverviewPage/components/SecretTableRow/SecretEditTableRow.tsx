/* eslint-disable no-nested-ternary */
import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import {
  CopyIcon,
  EditIcon,
  EyeOffIcon,
  SaveIcon,
  TrashIcon,
  Undo2Icon,
  WorkflowIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretReferenceTree } from "@app/components/secrets/SecretReferenceDetails";
import { DeleteActionModal, Modal, ModalContent, ModalTrigger } from "@app/components/v2";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import { Tooltip, TooltipContent, TooltipTrigger, UnstableIconButton } from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp, useToggle } from "@app/hooks";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { ProjectEnv, SecretType, SecretV3RawSanitized } from "@app/hooks/api/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";
import { CollapsibleSecretImports } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/CollapsibleSecretImports";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

type Props = {
  defaultValue?: string | null;
  secretName: string;
  secretId?: string;
  isOverride?: boolean;
  isCreatable?: boolean;
  isVisible?: boolean;
  isImportedSecret: boolean;
  environment: string;
  secretValueHidden: boolean;
  secretPath: string;
  onSecretCreate: (env: string, key: string, value: string) => Promise<void>;
  onSecretUpdate: (
    env: string,
    key: string,
    value: string,
    secretValueHidden: boolean,
    type?: SecretType,
    secretId?: string
  ) => Promise<void>;
  onSecretDelete: (env: string, key: string, secretId?: string) => Promise<void>;
  isRotatedSecret?: boolean;
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
    folders: {
      name: string;
      secrets?: { secretId: string; referencedSecretKey: string; referencedSecretEnv: string }[];
      isImported: boolean;
    }[];
  }[];
  isSecretPresent?: boolean;
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
  environment,
  secretPath,
  isVisible,
  secretId,
  isRotatedSecret,
  importedBy,
  importedSecret,
  isEmpty,
  isSecretPresent
}: Props) => {
  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "editSecret"
  ] as const);

  const { currentProject } = useProject();

  const [isFieldFocused, setIsFieldFocused] = useToggle();

  const fetchSecretValueParams =
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
          projectId: currentProject.id,
          isOverride
        };

  // scott: only fetch value if secret exists, has non-empty value and user has permission
  const canFetchValue = Boolean(importedSecret ?? secretId) && !isEmpty && !secretValueHidden;

  const {
    data: secretValueData,
    isPending: isPendingSecretValueData,
    isError: isErrorFetchingSecretValue,
    refetch: refetchSecretValue
  } = useGetSecretValue(fetchSecretValueParams, {
    enabled: canFetchValue && (isVisible || isFieldFocused)
  });

  const isFetchingSecretValue = canFetchValue && isPendingSecretValueData;

  const {
    handleSubmit,
    control,
    reset,
    setValue,
    setFocus,
    formState: { isDirty, isSubmitting }
  } = useForm({
    defaultValues: {
      value: secretValueData?.valueOverride ?? secretValueData?.value ?? (defaultValue || null)
    }
  });

  useEffect(() => {
    if (secretValueData && !isDirty) {
      setValue("value", secretValueData.valueOverride ?? secretValueData.value);
    }
  }, [secretValueData]);

  const { permission } = useProjectPermission();

  const [isDeleting, setIsDeleting] = useToggle();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const toggleModal = useCallback(() => {
    setIsModalOpen((prev) => !prev);
  }, []);

  const handleFormReset = () => {
    reset();
  };

  const handleCopySecretToClipboard = async () => {
    try {
      const { data } = await refetchSecretValue();

      await window.navigator.clipboard.writeText(data?.valueOverride ?? data?.value ?? "");
      createNotification({ type: "success", text: "Copied secret to clipboard" });
    } catch (e) {
      console.error(e);
      createNotification({
        type: "error",
        text: "Failed to fetch secret value."
      });
    }
  };

  const handleFormSubmit = async ({ value }: { value?: string | null }) => {
    if ((value || value === "") && secretName) {
      if (isCreatable) {
        await onSecretCreate(environment, secretName, value);
      } else {
        if (
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
          handlePopUpOpen("editSecret", { secretValue: value });
          return;
        }
        await onSecretUpdate(
          environment,
          secretName,
          value,
          secretValueHidden,
          isOverride ? SecretType.Personal : SecretType.Shared,
          secretId
        );
      }
    }
    if (secretValueHidden && !isOverride) {
      setTimeout(() => {
        reset({ value: defaultValue || null });
      }, 50);
    } else {
      reset({ value });
    }
  };

  const handleEditSecret = async ({ secretValue }: { secretValue: string }) => {
    await onSecretUpdate(
      environment,
      secretName,
      secretValue,
      secretValueHidden,
      isOverride ? SecretType.Personal : SecretType.Shared,
      secretId
    );
    reset({ value: secretValue });
    handlePopUpClose("editSecret");
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
    setIsDeleting.on();
    setIsModalOpen(false);

    try {
      await onSecretDelete(environment, secretName, secretId);
      reset({ value: null });
    } finally {
      setIsDeleting.off();
    }
  }, [onSecretDelete, environment, secretName, secretId, reset, setIsDeleting]);

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
    isImportedSecret ||
    (isRotatedSecret && !isOverride) ||
    isFetchingSecretValue ||
    isErrorFetchingSecretValue ||
    (isCreatable ? !canCreate : !canEditSecretValue);

  return (
    <div className="flex w-full cursor-text items-center space-x-2">
      <DeleteActionModal
        isOpen={isModalOpen}
        onClose={toggleModal}
        title="Do you want to delete the selected secret?"
        deleteKey={secretName}
        onDeleteApproved={handleDeleteSecret}
      />
      {secretValueHidden && !isOverride && (
        <Tooltip>
          <TooltipTrigger asChild>
            <EyeOffIcon className="size-4 text-secret" />
          </TooltipTrigger>
          <TooltipContent>
            You do not have access to view the current value
            {canEditSecretValue && !isRotatedSecret ? ", but you can set a new one" : "."}
          </TooltipContent>
        </Tooltip>
      )}
      <div className="grow pr-2 pl-1">
        <Controller
          control={control}
          name="value"
          render={({ field }) => (
            <InfisicalSecretInput
              {...field}
              isReadOnly={isReadOnly}
              value={
                (secretValueHidden && !isOverride) || isFetchingSecretValue
                  ? HIDDEN_SECRET_VALUE
                  : isErrorFetchingSecretValue
                    ? "Error fetching secret value..."
                    : (field.value as string)
              }
              key="secret-input"
              isVisible={isVisible && !secretValueHidden}
              secretPath={secretPath}
              environment={environment}
              isImport={isImportedSecret}
              defaultValue={secretValueHidden ? "" : undefined}
              canEditButNotView={secretValueHidden && !isOverride}
              onFocus={() => setIsFieldFocused.on()}
              onBlur={() => {
                field.onBlur();
                setIsFieldFocused.off();
              }}
            />
          )}
        />
      </div>
      <div className={twMerge("flex w-32 justify-end space-x-2 pl-2 transition-all")}>
        {isDirty && !isImportedSecret ? (
          <>
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
                      <UnstableIconButton
                        size="xs"
                        variant="success"
                        isDisabled={isSubmitting || !isAllowed}
                        onClick={handleSubmit(handleFormSubmit)}
                      >
                        <SaveIcon />
                      </UnstableIconButton>
                    </TooltipTrigger>
                    <TooltipContent>Save changes</TooltipContent>
                  </Tooltip>
                </div>
              )}
            </ProjectPermissionCan>
            <div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <UnstableIconButton
                    variant="danger"
                    size="xs"
                    onClick={handleFormReset}
                    isDisabled={isSubmitting}
                  >
                    <Undo2Icon />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>Undo changes</TooltipContent>
              </Tooltip>
            </div>
          </>
        ) : (
          <>
            <div className="opacity-0 transition-opacity duration-75 group-hover:opacity-100">
              <Tooltip>
                <TooltipTrigger>
                  <UnstableIconButton
                    isDisabled={
                      isImportedSecret ||
                      (isRotatedSecret && !isOverride) ||
                      (isCreatable ? !canCreate : !canEditSecretValue)
                    }
                    onClick={() => {
                      setFocus("value", { shouldSelect: true });
                    }}
                    variant="ghost"
                    size="xs"
                  >
                    <EditIcon />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>
                  {isImportedSecret
                    ? "Cannot Edit Imported Secret"
                    : isRotatedSecret && !isOverride
                      ? "Cannot Edit Rotated Secret"
                      : (isCreatable ? !canCreate : !canEditSecretValue)
                        ? "Access Denied"
                        : "Edit Value"}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="opacity-0 group-hover:opacity-100">
              <Tooltip>
                <TooltipTrigger>
                  <UnstableIconButton
                    isDisabled={!canFetchValue}
                    onClick={handleCopySecretToClipboard}
                    variant="ghost"
                    size="xs"
                  >
                    <CopyIcon />
                  </UnstableIconButton>
                </TooltipTrigger>
                <TooltipContent>
                  {canFetchValue
                    ? "Copy Secret"
                    : canReadSecretValue
                      ? "No Secret Value"
                      : "Access Denied"}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="opacity-0 group-hover:opacity-100">
              <Modal>
                <Tooltip>
                  <TooltipTrigger>
                    <ModalTrigger asChild>
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        isDisabled={!canReadSecretValue || !secretId || isEmpty}
                      >
                        <WorkflowIcon />
                      </UnstableIconButton>
                    </ModalTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Secret Reference Tree</TooltipContent>
                </Tooltip>
                <ModalContent
                  title="Secret Reference Details"
                  subTitle="Visual breakdown of secrets referenced by this secret."
                  onOpenAutoFocus={(e) => e.preventDefault()} // prevents secret input from displaying value on open
                >
                  <SecretReferenceTree
                    secretPath={secretPath}
                    environment={environment}
                    secretKey={secretName}
                  />
                </ModalContent>
              </Modal>
            </div>

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
                <div className="opacity-0 group-hover:opacity-100">
                  <Tooltip>
                    <TooltipTrigger>
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        className="hover:text-danger"
                        onClick={toggleModal}
                        isDisabled={isDeleting || !isAllowed || isRotatedSecret || isImportedSecret}
                      >
                        <TrashIcon />
                      </UnstableIconButton>
                    </TooltipTrigger>
                    <TooltipContent>
                      {/* eslint-disable-next-line no-nested-ternary */}
                      {isRotatedSecret
                        ? "Cannot Delete Rotated Secret"
                        : isImportedSecret
                          ? "Cannot Delete Imported Secret"
                          : "Delete"}
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </ProjectPermissionCan>
          </>
        )}
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
              secretsToDelete={[secretName]}
              onlyReferences
            />
          )
        }
      />
    </div>
  );
};
