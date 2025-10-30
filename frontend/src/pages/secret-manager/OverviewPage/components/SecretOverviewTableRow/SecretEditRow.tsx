import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import {
  faCheck,
  faCodeBranch,
  faCopy,
  faEyeSlash,
  faProjectDiagram,
  faShare,
  faTrash,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretReferenceTree } from "@app/components/secrets/SecretReferenceDetails";
import {
  DeleteActionModal,
  IconButton,
  Modal,
  ModalContent,
  ModalTrigger,
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
import { ProjectEnv, SecretType, SecretV3RawSanitized } from "@app/hooks/api/types";
import { useCopySecretToClipBoard } from "@app/hooks/secret-operations/useCopySecretToClipboard";
import { useCreatePersonalSecretOverride } from "@app/hooks/secret-operations/useCreatePersonalSecret";
import { useCreateSharedSecretPopup } from "@app/hooks/secret-operations/useCreateSharedSecret";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";
import { CollapsibleSecretImports } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/CollapsibleSecretImports";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

type Props = {
  defaultValue?: string | null;
  secretName: string;
  secretId?: string;
  hasOverride?: boolean;
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
  onSecretDelete: (env: string, key: string, type: SecretType, secretId?: string) => Promise<void>;
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

export const SecretEditRow = ({
  defaultValue,
  isCreatable,
  hasOverride,
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
          projectId: currentProject.id
        };

  // scott: only fetch value if secret exists, has non-empty value and user has permission
  const canFetchValue = Boolean(importedSecret ?? secretId) && !isEmpty && !secretValueHidden;

  const {
    data: secretValueData,
    isPending: isPendingSecretValueData,
    isError: isErrorFetchingSecretValue
  } = useGetSecretValue(fetchSecretValueParams, {
    enabled: canFetchValue && (isVisible || isFieldFocused)
  });

  const isFetchingSecretValue = canFetchValue && isPendingSecretValueData;

  const {
    handleSubmit,
    control,
    reset,
    getValues,
    setValue,
    formState: { isDirty, isSubmitting }
  } = useForm({
    defaultValues: {
      value: secretValueData?.value ?? (defaultValue || null)
    }
  });

  useEffect(() => {
    if (secretValueData && !isDirty) {
      setValue("value", secretValueData.value || "");
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

  const { copySecretToClipboard, isSecretValueCopied } = useCopySecretToClipBoard({
    getFetchedValue: isVisible ? () => getValues("value") || "" : undefined,
    fetchSecretParams: fetchSecretValueParams
  });

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
          SecretType.Shared,
          secretId
        );
      }
    }
    if (secretValueHidden) {
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
      SecretType.Shared,
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
      await onSecretDelete(environment, secretName, SecretType.Shared, secretId);
      reset({ value: null });
    } finally {
      setIsDeleting.off();
    }
  }, [onSecretDelete, environment, secretName, secretId, reset, setIsDeleting]);

  const openCreateSharedSecretPopup = useCreateSharedSecretPopup({
    getFetchedValue: () => getValues("value") || undefined,
    fetchSecretParams: fetchSecretValueParams
  });

  const deleteLabel = useMemo(() => {
    if (isRotatedSecret) return "Cannot Delete Rotated Secret";
    return "Delete";
  }, []);

  const createPersonalSecretOverride = useCreatePersonalSecretOverride(currentProject.id);

  const handleAddPersonalOverride = useCallback(async () => {
    createPersonalSecretOverride(
      {
        key: secretName,
        environment,
        secretPath
      },
      secretValueData?.value
    );
  }, [createPersonalSecretOverride, secretValueData?.value]);

  return (
    <div className="divide flex w-full cursor-text items-center space-x-2">
      <DeleteActionModal
        isOpen={isModalOpen}
        onClose={toggleModal}
        title="Do you want to delete the selected secret?"
        deleteKey={secretName}
        onDeleteApproved={handleDeleteSecret}
      />
      {secretValueHidden && (
        <Tooltip
          content={`You do not have access to view the current value${canEditSecretValue && !isRotatedSecret ? ", but you can set a new one" : "."}`}
        >
          <FontAwesomeIcon className="pl-2" size="sm" icon={faEyeSlash} />
        </Tooltip>
      )}
      <div className="grow pr-2 pl-1">
        <Controller
          control={control}
          name="value"
          render={({ field }) => (
            <InfisicalSecretInput
              {...field}
              isReadOnly={
                isImportedSecret ||
                isRotatedSecret ||
                isFetchingSecretValue ||
                isErrorFetchingSecretValue
              }
              value={
                // eslint-disable-next-line no-nested-ternary
                isFetchingSecretValue
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
              canEditButNotView={secretValueHidden}
              onFocus={() => setIsFieldFocused.on()}
              onBlur={() => {
                field.onBlur();
                setIsFieldFocused.off();
              }}
            />
          )}
        />
      </div>

      <div
        className={twMerge(
          "flex justify-center space-x-3 pl-2 transition-all",
          isImportedSecret && "pointer-events-none opacity-0"
        )}
      >
        {isDirty ? (
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
                  <Tooltip content="Save">
                    <IconButton
                      variant="plain"
                      ariaLabel="submit-value"
                      className="h-full"
                      isDisabled={isSubmitting || !isAllowed}
                      onClick={handleSubmit(handleFormSubmit)}
                    >
                      <FontAwesomeIcon icon={faCheck} />
                    </IconButton>
                  </Tooltip>
                </div>
              )}
            </ProjectPermissionCan>
            <div>
              <Tooltip content="cancel">
                <IconButton
                  variant="plain"
                  colorSchema="danger"
                  ariaLabel="reset-value"
                  className="h-full"
                  onClick={handleFormReset}
                  isDisabled={isSubmitting}
                >
                  <FontAwesomeIcon icon={faXmark} className="hover:text-red" />
                </IconButton>
              </Tooltip>
            </div>
          </>
        ) : (
          <>
            <div className="opacity-0 group-hover:opacity-100">
              <Tooltip content="Copy Secret">
                <IconButton
                  isDisabled={secretValueHidden}
                  ariaLabel="copy-value"
                  onClick={copySecretToClipboard}
                  variant="plain"
                  className="h-full"
                >
                  <FontAwesomeIcon icon={isSecretValueCopied ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
            </div>

            <div className="opacity-0 group-hover:opacity-100">
              <Modal>
                <ModalTrigger asChild>
                  <div className="opacity-0 group-hover:opacity-100">
                    <Tooltip content="Secret Reference Tree">
                      <IconButton
                        variant="plain"
                        ariaLabel="reference-tree"
                        className="h-full"
                        isDisabled={!canReadSecretValue || !secretId || isEmpty}
                      >
                        <FontAwesomeIcon icon={faProjectDiagram} />
                      </IconButton>
                    </Tooltip>
                  </div>
                </ModalTrigger>
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
              I={ProjectPermissionActions.Read}
              a={subject(ProjectPermissionSub.Secrets, {
                environment,
                secretPath,
                secretName,
                secretTags: ["*"]
              })}
            >
              {(isAllowed) => (
                <InlineActionIconButton
                  hint="Share Secret"
                  icon={faShare}
                  isDisabled={!isAllowed}
                  onClick={openCreateSharedSecretPopup}
                  revealOnGroupHover
                />
              )}
            </ProjectPermissionCan>

            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={subject(ProjectPermissionSub.Secrets, {
                environment,
                secretPath,
                secretName,
                secretTags: ["*"]
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
                  <Tooltip content={deleteLabel}>
                    <IconButton
                      variant="plain"
                      ariaLabel="delete-value"
                      className="h-full"
                      onClick={toggleModal}
                      isDisabled={isDeleting || !isAllowed || isRotatedSecret}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </IconButton>
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
