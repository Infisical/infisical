import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Power, TriangleAlert } from "lucide-react";

import { Button } from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import { TPamAccount } from "@app/hooks/api/pam";

import { WebAccessStatusCard } from "./WebAccessStatusCard";

type Props = {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
};

type TLaunchResponse = {
  sessionId: string;
  iframeUrl: string;
  expiresAt: string;
};

export const WebResourceContent = ({ account, reason, mfaSessionId }: Props) => {
  const [session, setSession] = useState<TLaunchResponse | null>(null);
  const [error, setError] = useState("");
  const [ending, setEnding] = useState(false);
  const sessionRef = useRef<TLaunchResponse | null>(null);

  const endSession = useCallback(async () => {
    const active = sessionRef.current;
    if (!active) return;

    setEnding(true);
    try {
      await apiRequest.post(
        `/api/v1/pam/accounts/${account.id}/web-resource-sessions/${active.sessionId}/end`
      );
      sessionRef.current = null;
      setSession(null);
    } finally {
      setEnding(false);
    }
  }, [account.id]);

  useEffect(() => {
    let cancelled = false;

    const launch = async () => {
      try {
        const { data } = await apiRequest.post<TLaunchResponse>(
          `/api/v1/pam/accounts/${account.id}/web-resource-sessions`,
          { reason, mfaSessionId }
        );
        if (cancelled) {
          await apiRequest.post(
            `/api/v1/pam/accounts/${account.id}/web-resource-sessions/${data.sessionId}/end`
          );
          return;
        }
        sessionRef.current = data;
        setSession(data);
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        if (!cancelled) {
          setError(axiosErr.response?.data?.message ?? "Failed to launch web resource session.");
        }
      }
    };

    launch().catch(() => undefined);

    return () => {
      cancelled = true;
      const active = sessionRef.current;
      if (active) {
        sessionRef.current = null;
        apiRequest
          .post(`/api/v1/pam/accounts/${account.id}/web-resource-sessions/${active.sessionId}/end`)
          .catch(() => undefined);
      }
    };
  }, [account.id, reason, mfaSessionId]);

  if (error) {
    return (
      <WebAccessStatusCard
        tone="danger"
        icon={TriangleAlert}
        title="Web resource unavailable"
        description={error}
      />
    );
  }

  if (!session) {
    return (
      <WebAccessStatusCard icon={Loader2} title="Launching web resource">
        <div className="text-xs text-muted">Opening {account.name}...</div>
      </WebAccessStatusCard>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <ExternalLink className="size-4 shrink-0 text-product-pam" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{account.name}</div>
            <div className="text-xs text-muted">
              Expires {new Date(session.expiresAt).toLocaleTimeString()}
            </div>
          </div>
        </div>
        <Button variant="outline" size="xs" onClick={endSession} isDisabled={ending}>
          {ending ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
          End
        </Button>
      </div>
      <iframe
        title={account.name}
        src={session.iframeUrl}
        className="min-h-0 flex-1 border-0 bg-white"
        referrerPolicy="no-referrer"
        sandbox="allow-forms allow-scripts"
      />
    </div>
  );
};
