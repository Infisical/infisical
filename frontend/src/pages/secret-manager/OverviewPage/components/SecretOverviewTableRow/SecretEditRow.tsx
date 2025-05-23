import { useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import {
  faCheck,
  faCopy,
  faEyeSlash,
  faProjectDiagram,
  faTrash,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  hasSecretReference,
  SecretReferenceTree
} from "@app/components/secrets/SecretReferenceDetails";
import {
  DeleteActionModal,
  IconButton,
  Modal,
  ModalContent,
  ModalTrigger,
  Tooltip
} from "@app/components/v2";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp, useToggle } from "@app/hooks";
import { SecretType } from "@app/hooks/api/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";
import { CollapsibleSecretImports } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/CollapsibleSecretImports";

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
    type?: SecretType,
    secretId?: string
  ) => Promise<void>;
  onSecretDelete: (env: string, key: string, secretId?: string) => Promise<void>;
  isRotatedSecret?: boolean;
  importedBy?: {
    environment: { name: string; slug: string };
    folders: {
      name: string;
      secrets?: { secretId: string; referencedSecretKey: string; referencedSecretEnv: string }[];
      isImported: boolean;
    }[];
  }[];
};

export const SecretEditRow = ({
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
  importedBy
}: Props) => {
  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "editSecret"
  ] as const);

  const {
    handleSubmit,
    control,
    reset,
    getValues,
    formState: { isDirty, isSubmitting }
  } = useForm({
    values: {
      value: defaultValue || null
    }
  });

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
    const { value } = getValues();
    if (value) {
      try {
        await window.navigator.clipboard.writeText(value);
        createNotification({ type: "success", text: "Copied secret to clipboard" });
      } catch (error) {
        console.log(error);
        createNotification({ type: "error", text: "Failed to copy secret to clipboard" });
      }
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

  return (
    <div className="group flex w-full cursor-text items-center space-x-2">
      <DeleteActionModal
        isOpen={isModalOpen}
        onClose={toggleModal}
        title="Do you want to delete the selected secret?"
        deleteKey={secretName}
        onDeleteApproved={handleDeleteSecret}
      />
      {secretValueHidden && !isOverride && (
        <Tooltip
          content={`You do not have access to view the current value${canEditSecretValue && !isRotatedSecret ? ", but you can set a new one" : "."}`}
        >
          <FontAwesomeIcon className="pl-2" size="sm" icon={faEyeSlash} />
        </Tooltip>
      )}
      <div className="flex-grow border-r border-r-mineshaft-600 pl-1 pr-2">
        <Controller
          disabled={isImportedSecret && !defaultValue}
          control={control}
          name="value"
          render={({ field }) => (
            <InfisicalSecretInput
              {...field}
              isReadOnly={isImportedSecret || (isRotatedSecret && !isOverride)}
              value={field.value as string}
              key="secret-input"
              isVisible={isVisible && !secretValueHidden}
              secretPath={secretPath}
              environment={environment}
              isImport={isImportedSecret}
              defaultValue={secretValueHidden ? "" : undefined}
              canEditButNotView={secretValueHidden && !isOverride}
            />
          )}
        />
      </div>

      <div
        className={twMerge(
          "flex w-24 justify-center space-x-3 pl-2 transition-all",
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
                  <Tooltip content="save">
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
                  onClick={handleCopySecretToClipboard}
                  variant="plain"
                  className="h-full"
                >
                  <FontAwesomeIcon icon={faCopy} />
                </IconButton>
              </Tooltip>
            </div>

            <div className="opacity-0 group-hover:opacity-100">
              <Modal>
                <ModalTrigger asChild>
                  <div className="opacity-0 group-hover:opacity-100">
                    <Tooltip
                      content={
                        hasSecretReference(defaultValue || "")
                          ? "Secret Reference Tree"
                          : "Secret does not contain references"
                      }
                    >
                      <IconButton
                        variant="plain"
                        ariaLabel="reference-tree"
                        className="h-full"
                        isDisabled={!hasSecretReference(defaultValue || "") || !canReadSecretValue}
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
                  <Tooltip content={isRotatedSecret ? "Cannot Delete Rotated Secret" : "Delete"}>
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
