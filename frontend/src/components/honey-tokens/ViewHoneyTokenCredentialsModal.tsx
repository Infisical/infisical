import { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  PageLoader
} from "@app/components/v3";
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionHoneyTokenActions } from "@app/context/ProjectPermissionContext/types";
import { useGetHoneyTokenCredentials } from "@app/hooks/api/honeyTokens";
import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";
import { TDashboardHoneyToken } from "@app/hooks/api/honeyTokens/types";

import { AwsHoneyTokenCredentials } from "./ViewHoneyTokenCredentials/AwsHoneyTokenCredentials";

type Props = {
  honeyToken?: TDashboardHoneyToken;
  projectId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const renderCredentials = (
  honeyToken: TDashboardHoneyToken,
  credentials: Record<string, string>
): ReactNode => {
  switch (honeyToken.type) {
    case HoneyTokenType.AWS:
      return (
        <AwsHoneyTokenCredentials
          secretsMapping={honeyToken.secretsMapping}
          credentials={credentials}
        />
      );
    default:
      throw new Error("Unhandled honey token type");
  }
};

const ModalBody = ({
  honeyToken,
  projectId,
  isOpen
}: {
  honeyToken?: TDashboardHoneyToken;
  projectId: string;
  isOpen: boolean;
}) => {
  const { permission } = useProjectPermission();
  const canReadCredentials = permission.can(
    ProjectPermissionHoneyTokenActions.ReadCredentials,
    ProjectPermissionSub.HoneyTokens
  );
  const { data: credentials, isPending } = useGetHoneyTokenCredentials({
    honeyTokenId: honeyToken?.id ?? "",
    projectId,
    enabled: isOpen && Boolean(honeyToken) && canReadCredentials
  });

  if (isPending) {
    return <PageLoader />;
  }

  if (!canReadCredentials) {
    return (
      <p className="text-sm text-muted">
        You do not have permission to view honey token credentials.
      </p>
    );
  }

  if (credentials && honeyToken) {
    return renderCredentials(honeyToken, credentials);
  }

  return <p className="text-sm text-red">No credentials found for this honey token.</p>;
};

export const ViewHoneyTokenCredentialsModal = ({
  honeyToken,
  projectId,
  isOpen,
  onOpenChange
}: Props) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Honey Token Credentials</DialogTitle>
          {honeyToken && (
            <DialogDescription>Credentials for &quot;{honeyToken.name}&quot;.</DialogDescription>
          )}
        </DialogHeader>
        <ModalBody honeyToken={honeyToken} projectId={projectId} isOpen={isOpen} />
      </DialogContent>
    </Dialog>
  );
};
