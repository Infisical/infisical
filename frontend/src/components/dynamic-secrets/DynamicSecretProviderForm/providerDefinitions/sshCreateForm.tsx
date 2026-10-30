import { ReactNode, useState } from "react";

import {
  Button,
  CopyButton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input
} from "@app/components/v3";
import { useGetSshCaPublicKey } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { getAuthToken } from "@app/hooks/api/reactQuery";
import { ProjectEnv } from "@app/hooks/api/types";

import { DynamicSecretProviderForm } from "../DynamicSecretProviderForm";
import { sshDynamicSecretProvider } from "./ssh";
import { SSH_CREATE_WORKFLOW_BOUNDARY_REASONS } from "./sshContract";

type Props = {
  header?: ReactNode;
  onCompleted: () => void;
  onCancel: () => void;
  onBack?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  secretPath: string;
  projectSlug: string;
  environments: ProjectEnv[];
  isSingleEnvironmentMode?: boolean;
};

/** Create-only SSH wrapper for the post-create certificate setup disclosure. */
export const SshDynamicSecretCreateForm = ({ onCompleted, ...props }: Props) => {
  const [createdId, setCreatedId] = useState<string>();
  const { data: caPublicKey } = useGetSshCaPublicKey({
    dynamicSecretId: createdId ?? "",
    enabled: Boolean(createdId)
  });
  const setupCommand = createdId
    ? `curl -H "Authorization: Bearer ${getAuthToken()}" "${window.location.origin}/api/v1/dynamic-secrets/ssh-ca-setup/${createdId}" | sudo bash`
    : "";
  const closeSetup = () => {
    setCreatedId(undefined);
    onCompleted();
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DynamicSecretProviderForm
          mode="create"
          definition={sshDynamicSecretProvider}
          onCompleted={(result) => setCreatedId((result as TDynamicSecret).id)}
          {...props}
        />
      </div>
      <Dialog
        open={Boolean(createdId)}
        onOpenChange={(open) => {
          if (!open) closeSetup();
        }}
      >
        <DialogContent className="w-2xl">
          <DialogHeader>
            <DialogTitle>Certificate Authentication Setup</DialogTitle>
            <DialogDescription>
              Configure the target host to trust certificates issued by this dynamic secret.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-sm text-accent">Run this command on the target host:</p>
              <div className="flex gap-2">
                <Input value={setupCommand} readOnly />
                <CopyButton value={setupCommand} ariaLabel="Copy setup command" />
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm text-accent">Or install the CA public key manually:</p>
              <div className="flex gap-2">
                <Input type="password" value={caPublicKey ?? ""} readOnly />
                <CopyButton value={caPublicKey ?? ""} ariaLabel="Copy CA public key" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={closeSetup}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

/** Explicit create boundary that owns SSH's post-create host setup disclosure. */
export const sshDynamicSecretCreateBoundary = {
  reasons: SSH_CREATE_WORKFLOW_BOUNDARY_REASONS,
  Component: SshDynamicSecretCreateForm
} as const;
