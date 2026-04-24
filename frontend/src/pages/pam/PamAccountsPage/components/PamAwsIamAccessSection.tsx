import { useEffect, useRef, useState } from "react";
import { CopyIcon, ExternalLinkIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import { Button, IconButton, Input, Label } from "@app/components/v3";
import { TPamAccount, useAccessPamAccount, useGetAwsIamConsoleUrl } from "@app/hooks/api/pam";
import { TAwsIamCredentials } from "@app/hooks/api/pam/types";

const formatExpiry = (expiresAt: string) => {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (remainingMs <= 0) return "Expired";

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `Expires in ${hours}h ${minutes}m` : `Expires in ${minutes}m`;
};

type TStsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: string;
};

type Props = {
  account: TPamAccount;
  projectId: string;
  reason?: string;
  onClose: () => void;
};

export const PamAwsIamAccessSection = ({ account, projectId, reason, onClose }: Props) => {
  const accessPamAccount = useAccessPamAccount();
  const getAwsIamConsoleUrl = useGetAwsIamConsoleUrl();

  const [credentials, setCredentials] = useState<TStsCredentials | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setNow] = useState(Date.now());

  // Guards against React 18 StrictMode's double-invoked effect, which would
  // otherwise issue two STS sessions for a single modal open
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;

    const run = async () => {
      try {
        const response = await accessPamAccount.mutateAsync({
          accountId: account.id,
          resourceName: account.resource?.name ?? "",
          accountName: account.name,
          projectId,
          duration: `${(account.credentials as TAwsIamCredentials).defaultSessionDuration}s`,
          reason
        });

        if (
          !response.accessKeyId ||
          !response.secretAccessKey ||
          !response.sessionToken ||
          !response.expiresAt
        ) {
          setError("Backend did not return AWS credentials");
          return;
        }

        setCredentials({
          accessKeyId: response.accessKeyId,
          secretAccessKey: response.secretAccessKey,
          sessionToken: response.sessionToken,
          expiresAt: response.expiresAt
        });
        setSessionId(response.sessionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate AWS session credentials");
      }
    };

    run().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    createNotification({ text: `${label} copied to clipboard`, type: "info" });
  };

  const handleOpenConsole = async () => {
    if (!sessionId || !credentials) return;
    try {
      const { consoleUrl } = await getAwsIamConsoleUrl.mutateAsync({
        sessionId,
        projectId,
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken
      });
      window.open(consoleUrl, "_blank", "noopener,noreferrer");
      createNotification({ text: "AWS Console opened in a new tab", type: "success" });
      onClose();
    } catch (err) {
      createNotification({
        text: err instanceof Error ? err.message : "Failed to open AWS Console",
        type: "error"
      });
    }
  };

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-danger/20 bg-danger/5 p-4 text-sm text-danger"
      >
        {error}
      </div>
    );
  }

  if (!credentials) {
    return (
      <div className="flex h-40 items-center justify-center">
        <ContentLoader />
      </div>
    );
  }

  const fields = [
    { label: "Access Key ID", value: credentials.accessKeyId },
    { label: "Secret Access Key", value: credentials.secretAccessKey },
    { label: "Session Token", value: credentials.sessionToken }
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Credentials</p>
            <p className="text-xs text-muted">
              Use with the AWS CLI, SDKs, or paste into <code>~/.aws/credentials</code>
            </p>
          </div>
          <p className="text-xs text-muted">{formatExpiry(credentials.expiresAt)}</p>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          {fields.map(({ label, value }) => (
            <div key={label}>
              <Label className="mb-1 text-label">{label}</Label>
              <div className="flex gap-2">
                <Input value={value} readOnly />
                <IconButton
                  aria-label={`Copy ${label}`}
                  variant="outline"
                  onClick={() => handleCopy(value, label)}
                >
                  <CopyIcon />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-mineshaft-800 px-2 text-muted">OR</span>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground">Browser</p>
        <p className="mb-2 text-xs text-muted">
          Open the AWS Console signed in as the same temporary session
        </p>
        <Button
          variant="project"
          size="md"
          isFullWidth
          isPending={getAwsIamConsoleUrl.isPending}
          onClick={() => {
            handleOpenConsole().catch(() => {});
          }}
        >
          <ExternalLinkIcon />
          Open in AWS Console
        </Button>
      </div>
    </div>
  );
};
