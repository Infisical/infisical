import { useEffect, useRef, useState } from "react";
import { Globe2, TriangleAlert } from "lucide-react";

import { Button } from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import { TPamAccount } from "@app/hooks/api/pam";

import { WebAccessStatusCard } from "./WebAccessStatusCard";

type Props = {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
};

export const WebServerAccessContent = ({ account, reason, mfaSessionId }: Props) => {
  const [errorMessage, setErrorMessage] = useState<string>();
  const [retryCount, setRetryCount] = useState(0);
  const launchInProgressRef = useRef(false);

  useEffect(() => {
    if (launchInProgressRef.current) return;
    launchInProgressRef.current = true;
    setErrorMessage(undefined);

    const launch = async () => {
      try {
        const ticketResponse = await apiRequest.post<{ ticket: string }>(
          `/api/v1/pam/accounts/${account.id}/web-access-ticket`,
          { reason, mfaSessionId }
        );
        const sessionResponse = await apiRequest.post<{ url: string }>(
          `/api/v1/pam/accounts/${account.id}/browser-access-session`,
          { ticket: ticketResponse.data.ticket }
        );
        window.location.replace(sessionResponse.data.url);
      } catch (err: unknown) {
        const responseMessage = (
          err as {
            response?: { data?: { message?: string } };
          }
        ).response?.data?.message;
        setErrorMessage(responseMessage ?? "Failed to open the Web Server through the Gateway.");
        launchInProgressRef.current = false;
      }
    };

    launch().catch(() => undefined);
  }, [account.id, reason, mfaSessionId, retryCount]);

  if (errorMessage) {
    return (
      <WebAccessStatusCard
        tone="danger"
        icon={TriangleAlert}
        title="Could not open Web Server"
        description={errorMessage}
      >
        <Button variant="pam" isFullWidth onClick={() => setRetryCount((value) => value + 1)}>
          Try Again
        </Button>
      </WebAccessStatusCard>
    );
  }

  return (
    <WebAccessStatusCard
      icon={Globe2}
      title="Opening Web Server"
      description="Connecting through the assigned Gateway and preparing HTTP Basic Authentication."
    />
  );
};
