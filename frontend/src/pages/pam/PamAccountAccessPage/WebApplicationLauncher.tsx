import { useEffect, useRef, useState } from "react";
import { CircleStop, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";

import { Button } from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import { TPamAccount, useAccessPamAccount } from "@app/hooks/api/pam";

import { WebAccessStatusCard } from "./WebAccessStatusCard";

type Props = {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
};

export const WebApplicationLauncher = ({ account, reason, mfaSessionId }: Props) => {
  const accessPamAccount = useAccessPamAccount();
  const launchedRef = useRef(false);
  const [proxyUrl, setProxyUrl] = useState<string>();
  const [sessionId, setSessionId] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isEnding, setIsEnding] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);

  useEffect(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;

    if (!account.folderName) {
      setErrorMessage("This account is missing its folder name.");
      return;
    }

    accessPamAccount
      .mutateAsync({
        path: `${account.folderName}/${account.name}`,
        reason,
        mfaSessionId,
        accessMethod: "web"
      })
      .then((response) => {
        if (!response.proxyUrl) {
          setErrorMessage("The web application proxy did not return a launch URL.");
          return;
        }
        setSessionId(response.sessionId);
        setProxyUrl(response.proxyUrl);
      })
      .catch((err: unknown) => {
        const axiosError = err as { response?: { data?: { message?: string } } };
        setErrorMessage(
          axiosError.response?.data?.message ??
            "The internal web application session could not be started."
        );
      });
  }, [accessPamAccount, account.folderName, account.name, mfaSessionId, reason]);

  const endSession = async () => {
    if (!sessionId) return;
    setIsEnding(true);
    try {
      await apiRequest.post(`/api/v1/pam/sessions/${sessionId}/terminate`);
      setHasEnded(true);
      setProxyUrl(undefined);
    } finally {
      setIsEnding(false);
    }
  };

  if (errorMessage) {
    return (
      <WebAccessStatusCard
        tone="danger"
        icon={TriangleAlert}
        title="Unable to open application"
        description={errorMessage}
      />
    );
  }

  if (hasEnded) {
    return (
      <WebAccessStatusCard
        icon={ShieldCheck}
        title="Session ended"
        description="The Gateway connection was closed and the HTTP audit log is available from PAM Sessions."
      />
    );
  }

  if (!proxyUrl) {
    return (
      <WebAccessStatusCard
        icon={Loader2}
        title="Opening secure session"
        description="Infisical is connecting to the application through your Gateway."
      />
    );
  }

  return (
    <div className="flex h-dvh w-screen flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="size-2 shrink-0 rounded-full bg-success" />
          <span className="truncate text-sm font-medium text-foreground">{account.name}</span>
          <span className="hidden text-xs text-muted sm:inline">
            HTTP activity is recorded by the Gateway
          </span>
        </div>
        <Button variant="danger" size="sm" isPending={isEnding} onClick={endSession}>
          <CircleStop />
          End Session
        </Button>
      </div>
      <iframe
        title={account.name}
        src={proxyUrl}
        sandbox="allow-forms allow-scripts"
        referrerPolicy="no-referrer"
        className="min-h-0 flex-1 border-0 bg-white"
      />
    </div>
  );
};
