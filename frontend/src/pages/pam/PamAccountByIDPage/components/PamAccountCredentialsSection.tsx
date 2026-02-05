import { faCopy, faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { GenericFieldLabel, IconButton, Input } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";
import { PamResourceType, TPamAccount } from "@app/hooks/api/pam";
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
    <div>
      <GenericFieldLabel label={label}>
        <div className="mt-1 flex items-center gap-2">
          <Input value={value} readOnly className="flex-1 font-mono text-sm" />
          <IconButton ariaLabel="Copy" variant="outline_bg" onClick={handleCopy} size="sm">
            <FontAwesomeIcon icon={faCopy} />
          </IconButton>
        </div>
      </GenericFieldLabel>
    </div>
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
    <GenericFieldLabel label="Default Session Duration">
      {Math.floor(credentials.defaultSessionDuration / 60)} minutes
    </GenericFieldLabel>
  </>
);

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
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Credentials</h3>
        <ProjectPermissionCan
          I={ProjectPermissionPamAccountActions.Edit}
          a={ProjectPermissionSub.PamAccounts}
        >
          {(isAllowed) => (
            <IconButton
              variant="plain"
              colorSchema="secondary"
              ariaLabel="Edit credentials"
              onClick={onEdit}
              isDisabled={!isAllowed}
            >
              <FontAwesomeIcon icon={faEdit} />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <CredentialsContent account={account} />
    </div>
  );
};
