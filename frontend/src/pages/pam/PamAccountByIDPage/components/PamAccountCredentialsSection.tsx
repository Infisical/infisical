import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import axios from "axios";
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
  ShieldCheckIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Spinner } from "@app/components/v2";
import {
  Button,
  Detail,
  DetailLabel,
  DetailValue,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamAccountActions } from "@app/context/ProjectPermissionContext/types";
import { useTimedReset } from "@app/hooks";
import { MfaSessionStatus, TMfaSessionStatusResponse } from "@app/hooks/api/mfaSession";
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

type Props = {
  account: TPamAccount;
  onEdit: VoidFunction;
};

// -- Field components for the main section (non-sensitive, always visible) --

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

// -- Dialog field components (sensitive with eye toggle + copy) --

const MASKED_VALUE = "••••••••••••";

const SensitiveField = ({ label, value }: { label: string; value: string }) => {
  const [isVisible, toggleVisibility] = useReducer((prev) => !prev, false);
  const [, isCopied, setCopied] = useTimedReset<string>({
    initialState: ""
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied("copied");
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-32 shrink-0 text-sm">{label}</span>
      <span
        className="min-w-0 flex-1 truncate font-mono text-sm"
        title={isVisible ? value : undefined}
      >
        {isVisible ? value : MASKED_VALUE}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <UnstableIconButton variant="ghost" size="xs" onClick={toggleVisibility}>
            {isVisible ? <EyeOffIcon /> : <EyeIcon />}
          </UnstableIconButton>
        </TooltipTrigger>
        <TooltipContent>{isVisible ? "Hide" : "Reveal"}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <UnstableIconButton variant="ghost" size="xs" onClick={handleCopy}>
            {isCopied ? <CheckIcon /> : <CopyIcon />}
          </UnstableIconButton>
        </TooltipTrigger>
        <TooltipContent>{isCopied ? "Copied" : "Copy"}</TooltipContent>
      </Tooltip>
    </div>
  );
};

const PlainField = ({ label, value }: { label: string; value: string }) => {
  const [, isCopied, setCopied] = useTimedReset<string>({
    initialState: ""
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied("copied");
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-32 shrink-0 text-sm">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-sm" title={value}>
        {value}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <UnstableIconButton variant="ghost" size="xs" onClick={handleCopy}>
            {isCopied ? <CheckIcon /> : <CopyIcon />}
          </UnstableIconButton>
        </TooltipTrigger>
        <TooltipContent>{isCopied ? "Copied" : "Copy"}</TooltipContent>
      </Tooltip>
    </div>
  );
};

// -- Per-resource-type field definitions for the dialog --

type FieldDef = {
  key: string;
  label: string;
  sensitive: boolean;
};

const RESOURCE_FIELD_DEFS: Record<string, FieldDef[]> = {
  [PamResourceType.Postgres]: [
    { key: "username", label: "Username", sensitive: false },
    { key: "password", label: "Password", sensitive: true }
  ],
  [PamResourceType.MySQL]: [
    { key: "username", label: "Username", sensitive: false },
    { key: "password", label: "Password", sensitive: true }
  ],
  [PamResourceType.MsSQL]: [
    { key: "username", label: "Username", sensitive: false },
    { key: "password", label: "Password", sensitive: true }
  ],
  [PamResourceType.SSH]: [
    { key: "authMethod", label: "Auth Method", sensitive: false },
    { key: "username", label: "Username", sensitive: false },
    { key: "password", label: "Password", sensitive: true },
    { key: "privateKey", label: "Private Key", sensitive: true }
  ],
  [PamResourceType.Redis]: [
    { key: "username", label: "Username", sensitive: false },
    { key: "password", label: "Password", sensitive: true }
  ],
  [PamResourceType.Kubernetes]: [
    { key: "authMethod", label: "Auth Method", sensitive: false },
    { key: "serviceAccountToken", label: "Service Account Token", sensitive: true }
  ],
  [PamResourceType.AwsIam]: [
    { key: "targetRoleArn", label: "Target Role ARN", sensitive: false },
    { key: "defaultSessionDuration", label: "Session Duration (s)", sensitive: false }
  ],
  [PamResourceType.Windows]: [
    { key: "username", label: "Username", sensitive: false },
    { key: "password", label: "Password", sensitive: true }
  ],
  [PamResourceType.ActiveDirectory]: [
    { key: "username", label: "Username", sensitive: false },
    { key: "password", label: "Password", sensitive: true }
  ]
};

const CredentialsDataContent = ({
  credentialsData
}: {
  credentialsData: TPamAccountCredentialsResponse;
}) => {
  const { credentials, resourceType } = credentialsData;

  const fieldDefs = RESOURCE_FIELD_DEFS[resourceType] || [];

  const visibleFields = fieldDefs.filter((f) => {
    const value = credentials[f.key];
    return value !== undefined && value !== null && String(value).length > 0;
  });

  if (visibleFields.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium text-label">Credentials</h4>
      <div className="flex flex-col gap-1.5 rounded-md border border-border bg-container p-3">
        {visibleFields.map((field) =>
          field.sensitive ? (
            <SensitiveField
              key={field.key}
              label={field.label}
              value={String(credentials[field.key])}
            />
          ) : (
            <PlainField
              key={field.key}
              label={field.label}
              value={String(credentials[field.key])}
            />
          )
        )}
      </div>
    </div>
  );
};

// -- Dialog state machine --

type MfaState = {
  required: boolean;
  sessionId?: string;
  verifying: boolean;
};

type DialogState =
  | { status: "loading" }
  | { status: "mfa"; mfa: MfaState }
  | { status: "error"; message: string }
  | { status: "success"; data: TPamAccountCredentialsResponse };

const MFA_POLL_INTERVAL = 2000;
const MFA_TIMEOUT = 5 * 60 * 1000;

const CredentialsDialog = ({
  isOpen,
  onOpenChange,
  accountId
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
}) => {
  const [state, setState] = useState<DialogState>({ status: "loading" });
  const mfaPopupRef = useRef<Window | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | undefined>();

  const fetchCredentials = useCallback(
    async (mfaSessionId?: string) => {
      const { data } = await apiRequest.get<TPamAccountCredentialsResponse>(
        `/api/v1/pam/accounts/${accountId}/credentials`,
        { params: mfaSessionId ? { mfaSessionId } : undefined }
      );
      return data;
    },
    [accountId]
  );

  const startMfaPolling = useCallback(
    (mfaSessionId: string) => {
      const startTime = Date.now();

      pollIntervalRef.current = setInterval(async () => {
        if (Date.now() - startTime > MFA_TIMEOUT) {
          clearInterval(pollIntervalRef.current);
          setState({ status: "error", message: "MFA verification timed out." });
          return;
        }

        try {
          const resp = await apiRequest.get<TMfaSessionStatusResponse>(
            `/api/v2/mfa-sessions/${mfaSessionId}/status`
          );
          if (resp.data.status === MfaSessionStatus.ACTIVE) {
            clearInterval(pollIntervalRef.current);
            if (mfaPopupRef.current && !mfaPopupRef.current.closed) {
              mfaPopupRef.current.close();
            }

            setState({ status: "loading" });
            try {
              const data = await fetchCredentials(mfaSessionId);
              setState({ status: "success", data });
            } catch {
              setState({
                status: "error",
                message: "Failed to fetch credentials after MFA verification."
              });
            }
          }
        } catch {
          clearInterval(pollIntervalRef.current);
          setState({ status: "error", message: "MFA verification failed." });
        }
      }, MFA_POLL_INTERVAL);
    },
    [fetchCredentials]
  );

  const handleMfaVerification = useCallback(() => {
    if (state.status !== "mfa" || !state.mfa.sessionId) return;

    const mfaUrl = `${window.location.origin}/mfa-session/${state.mfa.sessionId}`;
    mfaPopupRef.current = window.open(mfaUrl, "_blank");

    setState({
      status: "mfa",
      mfa: { required: true, sessionId: state.mfa.sessionId, verifying: true }
    });

    startMfaPolling(state.mfa.sessionId);
  }, [state, startMfaPolling]);

  useEffect(() => {
    if (!isOpen) return undefined;

    let cancelled = false;

    const run = async () => {
      setState({ status: "loading" });

      try {
        const data = await fetchCredentials();
        if (!cancelled) setState({ status: "success", data });
      } catch (err) {
        if (cancelled) return;

        if (axios.isAxiosError(err) && err.response?.data?.error === "SESSION_MFA_REQUIRED") {
          const mfaSessionId = err.response.data.details?.mfaSessionId as string | undefined;

          if (!mfaSessionId) {
            setState({ status: "error", message: "MFA session could not be created." });
            return;
          }

          setState({
            status: "mfa",
            mfa: { required: true, sessionId: mfaSessionId, verifying: false }
          });
        } else {
          setState({ status: "error", message: "Failed to fetch credentials." });
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (mfaPopupRef.current && !mfaPopupRef.current.closed) {
        mfaPopupRef.current.close();
      }
    };
  }, [isOpen, fetchCredentials]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Account Credentials</DialogTitle>
        </DialogHeader>

        {state.status === "loading" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Spinner className="h-6 w-6" />
            <p className="text-muted-foreground text-sm">Fetching credentials...</p>
          </div>
        )}

        {state.status === "mfa" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <ShieldCheckIcon className="text-muted-foreground size-8" />
            <h2 className="text-sm font-medium">MFA Verification Required</h2>
            <p className="max-w-sm text-center text-xs text-accent">
              Multi-factor authentication is required to view this account&apos;s credentials.
            </p>
            {state.mfa.verifying ? (
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <Spinner className="h-4 w-4" />
                Waiting for verification...
              </div>
            ) : (
              <Button variant="project" size="xs" onClick={handleMfaVerification}>
                Verify MFA
              </Button>
            )}
          </div>
        )}

        {state.status === "error" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-destructive text-sm">{state.message}</p>
          </div>
        )}

        {state.status === "success" && <CredentialsDataContent credentialsData={state.data} />}
      </DialogContent>
    </Dialog>
  );
};

// -- Main section component --

export const PamAccountCredentialsSection = ({ account, onEdit }: Props) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (
    Object.keys(account.credentials).length <= 0 ||
    [PamResourceType.Kubernetes].includes(account.resource.resourceType)
  )
    return null;

  return (
    <>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="text-lg font-medium">Credentials</h3>
          <ProjectPermissionCan
            I={ProjectPermissionPamAccountActions.Edit}
            a={ProjectPermissionSub.PamAccounts}
          >
            {(isAllowed) => (
              <UnstableIconButton
                variant="ghost"
                size="xs"
                onClick={onEdit}
                isDisabled={!isAllowed}
              >
                <PencilIcon />
              </UnstableIconButton>
            )}
          </ProjectPermissionCan>
        </div>
        <CredentialsContent account={account} />
        <ProjectPermissionCan
          I={ProjectPermissionPamAccountActions.ReadCredentials}
          a={ProjectPermissionSub.PamAccounts}
        >
          {(isAllowed) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-full">
                  <Button
                    variant="outline"
                    size="md"
                    isFullWidth
                    isDisabled={!isAllowed}
                    onClick={() => setIsDialogOpen(true)}
                  >
                    <EyeIcon />
                    View Credentials
                  </Button>
                </span>
              </TooltipTrigger>
              {!isAllowed && (
                <TooltipContent side="right">
                  You do not have permission to view credentials
                </TooltipContent>
              )}
            </Tooltip>
          )}
        </ProjectPermissionCan>
      </div>
      <CredentialsDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        accountId={account.id}
      />
    </>
  );
};
