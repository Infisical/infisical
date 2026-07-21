import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import FileSaver from "file-saver";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  FileDropzone,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
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
import { Organization, Project } from "@app/hooks/api/types";

const formSchema = z.object({
  kmsKeyId: z.string()
});

type TForm = z.infer<typeof formSchema>;

const BackupConfirmationModal = ({
  isOpen,
  onOpenChange,
  org,
  project
}: {
  isOpen: boolean;
  onOpenChange: (state: boolean) => void;
  org?: Organization;
  project?: Project;
}) => {
  const [isGeneratingBackup, setGeneratingBackup] = useToggle();
  const downloadKmsBackup = async () => {
    if (!project || !org) {
      return;
    }

    setGeneratingBackup.on();

    try {
      const { secretManager } = await fetchProjectKmsBackup(project.id);

      const [, , kmsFunction] = secretManager.split(".");
      const file = secretManager;

      const blob = new Blob([file], { type: "text/plain;charset=utf-8" });
      FileSaver.saveAs(blob, `kms-backup-${org.slug}-${project.slug}-${kmsFunction}.infisical.txt`);

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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create KMS Backup</DialogTitle>
          <DialogDescription>
            In case of interruptions with your configured external KMS, you can load a backup to set
            the project&apos;s KMS back to the default Infisical KMS.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="project"
            onClick={downloadKmsBackup}
            isPending={isGeneratingBackup}
            isDisabled={isGeneratingBackup}
          >
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const LoadBackupModal = ({
  isOpen,
  onOpenChange,
  org,
  workspace: project
}: {
  isOpen: boolean;
  onOpenChange: (state: boolean) => void;
  org?: Organization;
  workspace: Project;
}) => {
  const { mutateAsync: loadKmsBackup, isPending } = useLoadProjectKmsBackup(project.id);
  const [backupContent, setBackupContent] = useState("");
  const [backupFiles, setBackupFiles] = useState<File[]>([]);

  const handleOpenChange = (state: boolean) => {
    // Clear on every open-change (open and close), not only close: a FileReader
    // read can finish after the dialog closes and repopulate backupContent, so
    // clearing on reopen recovers from that stale state (Continue would otherwise
    // be enabled with no filename shown).
    setBackupContent("");
    setBackupFiles([]);
    onOpenChange(state);
  };

  const uploadKmsBackup = async () => {
    if (!project || !org) {
      return;
    }

    await loadKmsBackup(backupContent);
    createNotification({
      text: "Successfully loaded KMS backup",
      type: "success"
    });

    handleOpenChange(false);
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

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Load KMS Backup</DialogTitle>
          <DialogDescription>
            By loading a backup, the project&apos;s KMS will be switched to the default Infisical
            KMS.
          </DialogDescription>
        </DialogHeader>
        <FileDropzone
          accept=".txt"
          description=".infisical.txt backup file"
          files={backupFiles}
          accentClassName="text-project"
          activeFrameClassName="text-project"
          activeEmptyClassName="bg-project/10"
          onFilesSelect={(files) => {
            const file = files[0];
            parseFile(file);
            setBackupFiles(file ? [file] : []);
          }}
          onFileRemove={() => {
            setBackupFiles([]);
            setBackupContent("");
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="project"
            onClick={uploadKmsBackup}
            isPending={isPending}
            isDisabled={!backupContent || isPending}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const EncryptionTab = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const { data: externalKmsList } = useGetExternalKmsList(currentOrg.id);
  const { data: activeKms } = useGetActiveProjectKms(currentProject.id);

  const { mutateAsync: updateProjectKms, isPending: isUpdatingProjectKms } = useUpdateProjectKms(
    currentProject.id
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
    await updateProjectKms(
      data.kmsKeyId === INTERNAL_KMS_KEY_ID
        ? { type: KmsType.Internal }
        : { type: KmsType.External, kmsId: data.kmsKeyId }
    );

    createNotification({
      text: "Successfully updated project KMS",
      type: "success"
    });
  };

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Key Management</CardTitle>
              <CardDescription>
                Select which Key Management System to use for encrypting your project data
              </CardDescription>
            </div>
            {kmsKeyId !== INTERNAL_KMS_KEY_ID && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handlePopUpOpen("loadBackup")}>
                  Load Backup
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handlePopUpOpen("createBackupConfirmation")}
                >
                  Create Backup
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onUpdateProjectKms)}>
            <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Kms}>
              {(isAllowed) => (
                <Controller
                  control={control}
                  name="kmsKeyId"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <Field className="max-w-md">
                      <FieldLabel htmlFor="kmsKeyId">Key Management System</FieldLabel>
                      <Select
                        value={value}
                        onValueChange={onChange}
                        disabled={!isAllowed || isUpdatingProjectKms}
                      >
                        <SelectTrigger
                          id="kmsKeyId"
                          className="w-full"
                          aria-label="Key Management System"
                        >
                          <SelectValue placeholder="Select a KMS" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INTERNAL_KMS_KEY_ID} key="kms-internal">
                            Default Infisical KMS
                          </SelectItem>
                          {externalKmsList?.map((kms) => (
                            <SelectItem value={kms.id} key={`kms-${kms.id}`}>
                              {kms.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              )}
            </ProjectPermissionCan>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.Project}
            >
              {(isAllowed) => (
                <Button
                  className="mt-4"
                  variant="project"
                  type="submit"
                  isDisabled={!isAllowed || isSubmitting || !isDirty}
                  isPending={isSubmitting}
                >
                  Save
                </Button>
              )}
            </ProjectPermissionCan>
          </form>
        </CardContent>
      </Card>
      <BackupConfirmationModal
        isOpen={popUp.createBackupConfirmation.isOpen}
        onOpenChange={(state: boolean) => handlePopUpToggle("createBackupConfirmation", state)}
        org={currentOrg}
        project={currentProject}
      />
      <LoadBackupModal
        isOpen={popUp.loadBackup.isOpen}
        onOpenChange={(state: boolean) => handlePopUpToggle("loadBackup", state)}
        org={currentOrg}
        workspace={currentProject}
      />
    </>
  );
};
