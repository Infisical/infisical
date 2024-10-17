import { ChangeEvent, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import FileSaver from "file-saver";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  FormControl,
  IconButton,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useWorkspace
} from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import {
  useGetActiveProjectKms,
  useGetExternalKmsList,
  useLoadProjectKmsBackup,
  useUpdateProjectKms
} from "@app/hooks/api";
import { fetchProjectKmsBackup } from "@app/hooks/api/kms/queries";
import { INTERNAL_KMS_KEY_ID, KmsType } from "@app/hooks/api/kms/types";
import { Organization, Workspace } from "@app/hooks/api/types";

const formSchema = z.object({
  kmsKeyId: z.string()
});

type TForm = z.infer<typeof formSchema>;

const BackupConfirmationModal = ({
  isOpen,
  onOpenChange,
  org,
  workspace
}: {
  isOpen: boolean;
  onOpenChange: (state: boolean) => void;
  org?: Organization;
  workspace?: Workspace;
}) => {
  const [isGeneratingBackup, setGeneratingBackup] = useToggle();
  const downloadKmsBackup = async () => {
    if (!workspace || !org) {
      return;
    }

    setGeneratingBackup.on();

    try {
      const { secretManager } = await fetchProjectKmsBackup(workspace.id);

      const [, , kmsFunction] = secretManager.split(".");
      const file = secretManager;

      const blob = new Blob([file], { type: "text/plain;charset=utf-8" });
      FileSaver.saveAs(
        blob,
        `kms-backup-${org.slug}-${workspace.slug}-${kmsFunction}.infisical.txt`
      );

      onOpenChange(false);
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to create KMS backup",
        type: "error"
      });
    }

    setGeneratingBackup.off();
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="Create KMS backup">
        <p className="mb-6 text-bunker-300">
          In case of interruptions with your configured external KMS, you can load a backup to set
          the project&apos;s KMS back to the default Infisical KMS.
        </p>
        <Button onClick={downloadKmsBackup} isLoading={isGeneratingBackup}>
          Generate
        </Button>
        <Button
          onClick={() => onOpenChange(false)}
          colorSchema="secondary"
          variant="plain"
          className="ml-4"
        >
          Cancel
        </Button>
      </ModalContent>
    </Modal>
  );
};

const LoadBackupModal = ({
  isOpen,
  onOpenChange,
  org,
  workspace
}: {
  isOpen: boolean;
  onOpenChange: (state: boolean) => void;
  org?: Organization;
  workspace?: Workspace;
}) => {
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: loadKmsBackup, isLoading } = useLoadProjectKmsBackup(workspace?.id!);
  const [backupContent, setBackupContent] = useState("");
  const [backupFileName, setBackupFileName] = useState("");

  const uploadKmsBackup = async () => {
    if (!workspace || !org) {
      return;
    }

    try {
      await loadKmsBackup(backupContent);
      createNotification({
        text: "Successfully loaded KMS backup",
        type: "success"
      });

      onOpenChange(false);
    } catch (err) {
      console.error(err);
    }
  };

  const parseFile = (file?: File) => {
    if (!file) {
      createNotification({
        text: "Failed to parse uploaded file.",
        type: "error"
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (!event?.target?.result) return;
      const data = event.target.result.toString();
      setBackupContent(data);
    };

    try {
      reader.readAsText(file);
    } catch (error) {
      console.log(error);
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    parseFile(e.target?.files?.[0]);
    setBackupFileName(e.target?.files?.[0]?.name || "");
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(state: boolean) => {
        setBackupContent("");
        setBackupFileName("");
        onOpenChange(state);
      }}
    >
      <ModalContent title="Load KMS backup">
        <p className="mb-6 text-bunker-300">
          By loading a backup, the project&apos;s KMS will be switched to the default Infisical KMS.
        </p>
        <div className="flex justify-center">
          <input
            id="fileSelect"
            className="hidden"
            type="file"
            accept=".txt"
            onChange={handleFileUpload}
            ref={fileUploadRef}
          />
          <IconButton
            className="p-10"
            ariaLabel="upload-backup"
            colorSchema="secondary"
            onClick={() => {
              fileUploadRef?.current?.click();
            }}
          >
            <FontAwesomeIcon icon={faUpload} size="3x" />
          </IconButton>
        </div>
        {backupFileName && (
          <div className="mt-2 flex justify-center px-4 text-center">{backupFileName}</div>
        )}
        {backupContent && (
          <Button
            onClick={uploadKmsBackup}
            className="mt-10 w-fit"
            disabled={isLoading}
            isLoading={isLoading}
          >
            Continue
          </Button>
        )}
      </ModalContent>
    </Modal>
  );
};

export const EncryptionTab = () => {
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();

  const { data: externalKmsList } = useGetExternalKmsList(currentOrg?.id!);
  const { data: activeKms } = useGetActiveProjectKms(currentWorkspace?.id!);

  const { mutateAsync: updateProjectKms, isLoading: isUpdatingProjectKms } = useUpdateProjectKms(
    currentWorkspace?.id!
  );
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp([
    "createBackupConfirmation",
    "loadBackup"
  ] as const);
  const kmsKeyId = activeKms?.isExternal ? activeKms.id : INTERNAL_KMS_KEY_ID;

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      kmsKeyId
    }
  });

  const onUpdateProjectKms = async (data: TForm) => {
    try {
      await updateProjectKms(
        data.kmsKeyId === INTERNAL_KMS_KEY_ID
          ? { type: KmsType.Internal }
          : { type: KmsType.External, kmsId: data.kmsKeyId }
      );

      createNotification({
        text: "Successfully updated project KMS",
        type: "success"
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex justify-between">
        <h2 className="mb-2 flex-1 text-xl font-semibold text-mineshaft-100">Key Management</h2>
        {kmsKeyId !== INTERNAL_KMS_KEY_ID && (
          <div className="space-x-2">
            <Button colorSchema="secondary" onClick={() => handlePopUpOpen("loadBackup")}>
              Load Backup
            </Button>
            <Button
              colorSchema="secondary"
              onClick={() => {
                handlePopUpOpen("createBackupConfirmation");
              }}
            >
              Create Backup
            </Button>
          </div>
        )}
      </div>

      <p className="mb-4 text-gray-400">
        Select which Key Management System to use for encrypting your project data
      </p>
      <div className="mb-6 max-w-md">
        <form onSubmit={handleSubmit(onUpdateProjectKms)}>
          <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Kms}>
            {(isAllowed) => (
              <Controller
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl errorText={error?.message} isError={Boolean(error)}>
                    <Select
                      {...field}
                      isDisabled={!isAllowed || isUpdatingProjectKms}
                      onValueChange={onChange}
                      isLoading={isUpdatingProjectKms}
                      className="w-3/4 bg-mineshaft-600"
                    >
                      <SelectItem value={INTERNAL_KMS_KEY_ID} key="kms-internal">
                        Default Infisical KMS
                      </SelectItem>
                      {externalKmsList?.map((kms) => (
                        <SelectItem value={kms.id} key={`kms-${kms.id}`}>
                          {kms.name}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                control={control}
                name="kmsKeyId"
              />
            )}
          </ProjectPermissionCan>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Edit}
            a={ProjectPermissionSub.Workspace}
          >
            {(isAllowed) => (
              <Button
                colorSchema="secondary"
                type="submit"
                isDisabled={!isAllowed || isSubmitting || !isDirty}
                isLoading={isSubmitting}
              >
                Save
              </Button>
            )}
          </ProjectPermissionCan>
        </form>
      </div>
      <BackupConfirmationModal
        isOpen={popUp.createBackupConfirmation.isOpen}
        onOpenChange={(state: boolean) => handlePopUpToggle("createBackupConfirmation", state)}
        org={currentOrg}
        workspace={currentWorkspace}
      />
      <LoadBackupModal
        isOpen={popUp.loadBackup.isOpen}
        onOpenChange={(state: boolean) => handlePopUpToggle("loadBackup", state)}
        org={currentOrg}
        workspace={currentWorkspace}
      />
    </div>
  );
};
