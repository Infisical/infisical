import { useReducer } from "react";
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, PencilIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Detail, DetailLabel, DetailValue, IconButton, Input } from "@app/components/v3";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";
import { useTimedReset } from "@app/hooks";
import {
  PamResourceType,
  TActiveDirectoryAccount,
  TPamAccount,
  TWindowsAccount
} from "@app/hooks/api/pam";
import { TPamAccountCredentialsResponse } from "@app/hooks/api/pam/queries";
import { TAwsIamCredentials } from "@app/hooks/api/pam/types/aws-iam-resource";
import { TBaseSqlCredentials } from "@app/hooks/api/pam/types/shared/sql-resource";
import { SSHAuthMethod, TSSHCredentials } from "@app/hooks/api/pam/types/ssh-resource";

import { SensitiveCredentialsGate } from "./SensitiveCredentialsGate";
import { useCredentialsReveal } from "./useCredentialsReveal";

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
          <Input value={value} readOnly className="flex-1 font-mono text-sm" />
          <IconButton variant="ghost" onClick={handleCopy} size="sm">
            <CopyIcon />
          </IconButton>
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
        <DetailValue className="capitalize">{account.internalMetadata.accountType}</DetailValue>
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
        <DetailValue className="capitalize">{account.internalMetadata.accountType}</DetailValue>
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
    case PamResourceType.MsSQL:
    case PamResourceType.MongoDB:
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

const MASKED_VALUE = "••••••••••••";

const SensitiveField = ({ label, value }: { label: string; value: string }) => {
  const [isVisible, toggleVisibility] = useReducer((prev) => !prev, false);
  const [, isCopied, setCopied] = useTimedReset<string>({
    initialState: ""
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied("copied");
    } catch {
      createNotification({ type: "error", text: "Failed to copy to clipboard." });
    }
  };

  return (
    <Detail>
      <DetailLabel>{label}</DetailLabel>
      <DetailValue>
        <div className="flex items-center gap-2">
          <Input
            value={isVisible ? value : MASKED_VALUE}
            readOnly
            className="flex-1 font-mono text-sm"
          />
          <IconButton variant="ghost" size="sm" onClick={toggleVisibility}>
            {isVisible ? <EyeOffIcon /> : <EyeIcon />}
          </IconButton>
          <IconButton variant="ghost" size="sm" onClick={handleCopy}>
            {isCopied ? <CheckIcon /> : <CopyIcon />}
          </IconButton>
        </div>
      </DetailValue>
    </Detail>
  );
};

const MultilineSensitiveField = ({ label, value }: { label: string; value: string }) => {
  const [, isCopied, setCopied] = useTimedReset<string>({
    initialState: ""
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied("copied");
    } catch {
      createNotification({ type: "error", text: "Failed to copy to clipboard." });
    }
  };

  return (
    <Detail>
      <DetailLabel>
        <div className="flex w-full items-center justify-between">
          {label}
          <IconButton variant="ghost" size="sm" onClick={handleCopy}>
            {isCopied ? <CheckIcon /> : <CopyIcon />}
          </IconButton>
        </div>
      </DetailLabel>
      <DetailValue>
        <pre className="max-h-32 thin-scrollbar overflow-auto rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm break-all whitespace-pre-wrap">
          {value}
        </pre>
      </DetailValue>
    </Detail>
  );
};

type SensitiveFieldDef = {
  key: string;
  label: string;
  multiline?: boolean;
};

// Returns sensitive fields that require the "View Credentials" flow to reveal.
// Non-sensitive fields (username, auth method, etc.) are already shown by CredentialsContent above.
// When adding a new resource type, add a case here if it has credentials hidden from the sanitized view.
const getSensitiveFieldDefs = (account: TPamAccount): SensitiveFieldDef[] => {
  const { resourceType } = account.resource;

  switch (resourceType) {
    case PamResourceType.Postgres:
    case PamResourceType.MySQL:
    case PamResourceType.MsSQL:
    case PamResourceType.MongoDB:
    case PamResourceType.Redis:
    case PamResourceType.Windows:
    case PamResourceType.ActiveDirectory:
      return [{ key: "password", label: "Password" }];

    case PamResourceType.SSH: {
      const { authMethod } = account.credentials as TSSHCredentials;
      if (authMethod === SSHAuthMethod.Password) return [{ key: "password", label: "Password" }];
      if (authMethod === SSHAuthMethod.PublicKey)
        return [{ key: "privateKey", label: "Private Key", multiline: true }];
      return [];
    }

    default:
      return [];
  }
};

const RevealedCredentials = ({
  credentialsData,
  fieldDefs
}: {
  credentialsData: TPamAccountCredentialsResponse;
  fieldDefs: SensitiveFieldDef[];
}) => {
  const { credentials } = credentialsData;

  const presentFields = fieldDefs.filter((f) => {
    const value = credentials[f.key];
    return value !== undefined && value !== null && String(value).length > 0;
  });

  if (presentFields.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {presentFields.map((field) =>
        field.multiline ? (
          <MultilineSensitiveField
            key={field.key}
            label={field.label}
            value={String(credentials[field.key])}
          />
        ) : (
          <SensitiveField
            key={field.key}
            label={field.label}
            value={String(credentials[field.key])}
          />
        )
      )}
    </div>
  );
};

export const PamAccountCredentialsSection = ({ account, onEdit }: Props) => {
  const { state, startReveal, reset } = useCredentialsReveal(account.id);

  if (
    Object.keys(account.credentials).length <= 0 ||
    [PamResourceType.Kubernetes].includes(account.resource.resourceType)
  )
    return null;

  const sensitiveFieldDefs = getSensitiveFieldDefs(account);
  const hasSensitiveFields = sensitiveFieldDefs.length > 0;

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-lg font-medium">Credentials</h3>
        <ProjectPermissionCan
          I={ProjectPermissionPamAccountActions.Edit}
          a={ProjectPermissionSub.PamAccounts}
        >
          {(isAllowed) => (
            <IconButton variant="ghost" size="xs" onClick={onEdit} isDisabled={!isAllowed}>
              <PencilIcon />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <CredentialsContent account={account} />
      {hasSensitiveFields && (
        <SensitiveCredentialsGate
          state={state}
          accountName={account.name}
          resourceName={account.resource.name}
          resourceType={account.resource.resourceType}
          metadata={account.metadata}
          onReveal={() => {
            if (!account.credentialsConfigured) {
              createNotification({
                type: "error",
                text: "No password exists for this account."
              });
              return;
            }
            startReveal();
          }}
          onReset={reset}
        >
          {state.status === "revealed" && (
            <RevealedCredentials credentialsData={state.data} fieldDefs={sensitiveFieldDefs} />
          )}
        </SensitiveCredentialsGate>
      )}
    </div>
  );
};
