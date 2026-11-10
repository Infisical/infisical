import { useRef, useState } from "react";
import FileSaver from "file-saver";

import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import { SettingsCard } from "@app/components/v4/ui/settings-card";
import { SmallText } from "@app/components/v4/ui/text";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { INTERNAL_KMS_KEY_ID, KmsType } from "@app/hooks/api/kms/types";

import { useProjectPermission } from "../../access/permissions";
import { useProjectScope } from "../../access/project/scope";
import { failed, saved } from "../../access/toast";
import { RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";

const KeyManagement = ({
  projectId,
  activeKmsKeyId,
  locked
}: {
  projectId: string;
  activeKmsKeyId: string;
  locked?: string;
}) => {
  const { orgId } = useProjectScope();
  const adapter = useV4Adapter("projectIntegrations");
  const { data: externalKms = [] } = adapter.useExternalKmsList(orgId);
  const updateKms = adapter.useUpdateProjectKms(projectId);
  const [draft, setDraft] = useState(activeKmsKeyId);
  return (
    <SettingsCard
      title="Key management"
      dirty={draft !== activeKmsKeyId}
      locked={locked}
      onDiscard={() => setDraft(activeKmsKeyId)}
      onSave={async () => {
        await updateKms.mutateAsync(
          draft === INTERNAL_KMS_KEY_ID
            ? { type: KmsType.Internal }
            : { type: KmsType.External, kmsId: draft }
        );
        saved("Project KMS saved");
      }}
    >
      <Field label="Key management system">
        <Select
          label="Key management system"
          placeholder="Select a KMS"
          value={draft}
          options={[
            { value: INTERNAL_KMS_KEY_ID, label: "Default Infisical KMS" },
            ...externalKms.map((kms) => ({ value: kms.id, label: kms.name }))
          ]}
          onChange={setDraft}
        />
      </Field>
    </SettingsCard>
  );
};

const CreateBackupDialog = ({
  projectId,
  open,
  onOpenChange
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { orgId } = useProjectScope();
  const adapter = useV4Adapter("projectIntegrations");
  const { data: org } = useV4Adapter("org").useOrganization(orgId);
  const { data: project } = useV4Adapter("projectSettings").useProject(projectId);
  const [pending, setPending] = useState(false);

  const download = async () => {
    if (!org || !project) return;
    setPending(true);
    try {
      const { secretManager } = await adapter.fetchProjectKmsBackup(projectId);
      const [, , kmsFunction] = secretManager.split(".");
      FileSaver.saveAs(
        new Blob([secretManager], { type: "text/plain;charset=utf-8" }),
        `kms-backup-${org.slug}-${project.slug}-${kmsFunction}.infisical.txt`
      );
      saved("KMS backup downloaded");
      onOpenChange(false);
    } catch (error) {
      failed("Failed to create KMS backup", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Create KMS backup</DialogTitle>
          <DialogDescription>
            If your external KMS becomes unavailable, load this backup to switch the project back to
            the default Infisical KMS.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} onClick={download}>
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const LoadBackupDialog = ({
  projectId,
  open,
  onOpenChange
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const loadBackup = useV4Adapter("projectIntegrations").useLoadProjectKmsBackup(projectId);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setFile(undefined);
    setContent("");
    onOpenChange(next);
  };

  const choose = (selected?: File) => {
    if (!selected) {
      failed("Failed to parse uploaded file.");
      return;
    }
    setFile(selected);
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) setContent(event.target.result.toString());
    };
    reader.readAsText(selected);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Load KMS backup</DialogTitle>
          <DialogDescription>
            Loading a backup switches the project&apos;s KMS to the default Infisical KMS.
          </DialogDescription>
        </DialogHeader>
        <Field label="Backup file" description=".infisical.txt backup file">
          <Inline gap={8} align="center">
            <Button
              variant="outline"
              size="sm"
              icon="upload"
              onClick={() => input.current?.click()}
            >
              {file ? "Choose another file" : "Choose file"}
            </Button>
            {file && <SmallText>{file.name}</SmallText>}
            <input
              ref={input}
              hidden
              type="file"
              accept=".txt"
              aria-label="Backup file"
              onChange={(event) => {
                const { currentTarget } = event;
                choose(currentTarget.files?.[0]);
                currentTarget.value = "";
              }}
            />
          </Inline>
        </Field>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!content}
            onClick={async () => {
              setPending(true);
              try {
                await loadBackup.mutateAsync(content);
                saved("KMS backup loaded");
                handleOpenChange(false);
              } finally {
                setPending(false);
              }
            }}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const EncryptionSettings = () => {
  const { projectId } = useProjectScope();
  const { permission, isPending } = useProjectPermission(projectId);
  const { data: activeKms } = useV4Adapter("projectIntegrations").useActiveProjectKms(projectId);
  const [dialog, setDialog] = useState<"create" | "load">();
  if (!activeKms || isPending) return <SettingsCard title="Key management" loading />;
  const activeKmsKeyId = activeKms.isExternal ? activeKms.id : INTERNAL_KMS_KEY_ID;
  const canEdit =
    permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Kms) &&
    permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Project);
  return (
    <Stack gap={24}>
      <KeyManagement
        key={activeKmsKeyId}
        projectId={projectId}
        activeKmsKeyId={activeKmsKeyId}
        locked={canEdit ? undefined : RESTRICTED}
      />
      {activeKmsKeyId !== INTERNAL_KMS_KEY_ID && (
        <Card
          title="KMS backup"
          description="Restores the default Infisical KMS if your external KMS is unavailable."
          action={
            <Inline gap={8}>
              <Button variant="outline" size="sm" onClick={() => setDialog("load")}>
                Load backup
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDialog("create")}>
                Create backup
              </Button>
            </Inline>
          }
        />
      )}
      <CreateBackupDialog
        projectId={projectId}
        open={dialog === "create"}
        onOpenChange={(open) => setDialog(open ? "create" : undefined)}
      />
      <LoadBackupDialog
        projectId={projectId}
        open={dialog === "load"}
        onOpenChange={(open) => setDialog(open ? "load" : undefined)}
      />
    </Stack>
  );
};
