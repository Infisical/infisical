import { CopyIcon, PencilIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Detail,
  DetailLabel,
  DetailValue,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";
import {
  PamResourceType,
  TActiveDirectoryAccount,
  TPamAccount,
  TWindowsAccount
} from "@app/hooks/api/pam";
import { TAwsIamCredentials } from "@app/hooks/api/pam/types/aws-iam-resource";
import { TBaseSqlCredentials } from "@app/hooks/api/pam/types/shared/sql-resource";
import { SSHAuthMethod, TSSHCredentials } from "@app/hooks/api/pam/types/ssh-resource";

type Props = {
  account: TPamAccount;
  onEdit: VoidFunction;
};

const CopyableField = ({ label, value }: { label: string; value: string }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    createNotification({
      text: `${label} copied to clipboard`,
      type: "info"
    });
  };

  return (
    <Detail>
      <DetailLabel>{label}</DetailLabel>
      <DetailValue>
        <div className="flex items-center gap-2">
          <UnstableInput value={value} readOnly className="flex-1 font-mono text-sm" />
          <UnstableIconButton variant="ghost" onClick={handleCopy} size="sm">
            <CopyIcon />
          </UnstableIconButton>
        </div>
      </DetailValue>
    </Detail>
  );
};

const SqlCredentialsContent = ({ credentials }: { credentials: TBaseSqlCredentials }) => (
  <CopyableField label="Username" value={credentials.username} />
);

const SSHCredentialsContent = ({ credentials }: { credentials: TSSHCredentials }) => {
  if (credentials.authMethod === SSHAuthMethod.Password) {
    return <CopyableField label="Username" value={credentials.username} />;
  }

  if (credentials.authMethod === SSHAuthMethod.PublicKey) {
    return <CopyableField label="Username" value={credentials.username} />;
  }

  // Certificate auth
  return <CopyableField label="Username" value={credentials.username} />;
};

const AwsIamCredentialsContent = ({ credentials }: { credentials: TAwsIamCredentials }) => (
  <>
    <CopyableField label="Target Role ARN" value={credentials.targetRoleArn} />
    <Detail>
      <DetailLabel>Default Session Duration</DetailLabel>
      <DetailValue>{Math.floor(credentials.defaultSessionDuration / 60)} minutes</DetailValue>
    </Detail>
  </>
);

const WindowsCredentialsContent = ({ account }: { account: TWindowsAccount }) => {
  return (
    <>
      <Detail>
        <DetailLabel>Account Type</DetailLabel>
        <DetailValue className="capitalize">{account.metadata.accountType}</DetailValue>
      </Detail>
      <CopyableField label="Username" value={account.credentials.username} />
    </>
  );
};

const ActiveDirectoryCredentialsContent = ({ account }: { account: TActiveDirectoryAccount }) => {
  return (
    <>
      <Detail>
        <DetailLabel>Account Type</DetailLabel>
        <DetailValue className="capitalize">{account.metadata.accountType}</DetailValue>
      </Detail>
      <CopyableField label="Username" value={account.credentials.username} />
    </>
  );
};

const CredentialsContent = ({ account }: { account: TPamAccount }) => {
  const { resourceType } = account.resource;

  switch (resourceType) {
    case PamResourceType.Postgres:
    case PamResourceType.MySQL:
    case PamResourceType.Redis:
      return <SqlCredentialsContent credentials={account.credentials as TBaseSqlCredentials} />;
    case PamResourceType.SSH:
      return <SSHCredentialsContent credentials={account.credentials as TSSHCredentials} />;
    case PamResourceType.AwsIam:
      return <AwsIamCredentialsContent credentials={account.credentials as TAwsIamCredentials} />;
    case PamResourceType.Windows:
      return <WindowsCredentialsContent account={account as TWindowsAccount} />;
    case PamResourceType.ActiveDirectory:
      return <ActiveDirectoryCredentialsContent account={account as TActiveDirectoryAccount} />;
    default:
      return null;
  }
};

export const PamAccountCredentialsSection = ({ account, onEdit }: Props) => {
  if (
    Object.keys(account.credentials).length <= 0 ||
    [PamResourceType.Kubernetes].includes(account.resource.resourceType)
  )
    return null;

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Credentials</h3>
        <ProjectPermissionCan
          I={ProjectPermissionPamAccountActions.Edit}
          a={ProjectPermissionSub.PamAccounts}
        >
          {(isAllowed) => (
            <UnstableIconButton variant="ghost" size="xs" onClick={onEdit} isDisabled={!isAllowed}>
              <PencilIcon />
            </UnstableIconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <CredentialsContent account={account} />
    </div>
  );
};
