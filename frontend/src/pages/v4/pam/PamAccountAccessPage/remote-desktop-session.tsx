import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { RemoteDesktop, type RemoteDesktopStatus } from "@infisical/cipher/ui/remote-desktop";
import { Select } from "@infisical/cipher/ui/select";
import { isAxiosError } from "axios";

import { PamAccountType, type TPamAccount } from "@app/hooks/api/pam";

import { errorMessage } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import type { TWebAccessRemoteDesktop } from "../../data/pam/web-access/contract";
import { AccessCard } from "./access-gate";
import { MFA_FAILED, mfaSessionIdOf } from "./web-access";

type TSessionProps = {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
};

const RemoteDesktopSession = ({
  account,
  reason,
  mfaSessionId,
  selectedHost
}: TSessionProps & { selectedHost?: string }) => {
  const webAccess = useV4Adapter("pam").useWebAccess();
  const runMfa = useV4Adapter("pamAccess").useMfaChallenge();
  const [status, setStatus] = useState<RemoteDesktopStatus>("connecting");
  const [error, setError] = useState<string>();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const connectionRef = useRef<TWebAccessRemoteDesktop | null>(null);
  const generationRef = useRef(0);
  const mfaRef = useRef(mfaSessionId);

  const teardown = () => {
    connectionRef.current?.shutdown();
    connectionRef.current = null;
  };

  const connect = async () => {
    const container = surfaceRef.current;
    if (!container) return;
    teardown();
    generationRef.current += 1;
    const generation = generationRef.current;
    const isCurrent = () => generation === generationRef.current;
    setStatus("connecting");
    setError(undefined);
    const requestTicket = (ticketMfaSessionId?: string) =>
      webAccess.requestTicket({
        accountId: account.id,
        reason,
        mfaSessionId: ticketMfaSessionId,
        selectedHost
      });
    try {
      // The backend consumes an MFA session on first use, so a reconnect runs a fresh challenge
      const initialMfaSessionId = mfaRef.current;
      mfaRef.current = undefined;
      let ticket: string;
      try {
        ticket = await requestTicket(initialMfaSessionId);
      } catch (ticketError) {
        const challenge = mfaSessionIdOf(ticketError);
        if (!challenge || !isCurrent()) throw ticketError;
        const outcome = await runMfa(challenge);
        if (!isCurrent()) return;
        if (outcome !== "verified") throw new Error(MFA_FAILED[outcome]);
        ticket = await requestTicket(challenge);
      }
      if (!isCurrent()) return;
      const connection = await webAccess.connectRemoteDesktop({
        container,
        accountId: account.id,
        ticket,
        destination: account.name
      });
      if (!isCurrent()) {
        connection.shutdown();
        return;
      }
      connectionRef.current = connection;
      setStatus("connected");
      connection.ended.then(
        () => {
          if (!isCurrent()) return;
          teardown();
          setStatus("disconnected");
        },
        () => {
          if (!isCurrent()) return;
          teardown();
          setStatus("error");
          setError("Unable to establish the remote session.");
        }
      );
    } catch (connectError) {
      if (!isCurrent()) return;
      let text = "Failed to start RDP session";
      if (isAxiosError(connectError)) text = errorMessage(connectError) ?? text;
      else if (connectError instanceof Error && connectError.message) text = connectError.message;
      setStatus("error");
      setError(text);
    }
  };

  const startSession = useEffectEvent(() => {
    connect();
  });

  useEffect(() => {
    startSession();
    return () => {
      generationRef.current += 1;
      connectionRef.current?.shutdown();
      connectionRef.current = null;
    };
  }, []);

  return (
    <RemoteDesktop
      label={account.name}
      status={status}
      error={error}
      style={{ flex: 1, minHeight: 480 }}
      details={[
        ...(selectedHost ? [{ label: "Host", value: selectedHost }] : []),
        { label: "Account", value: account.name }
      ]}
      surface={<div ref={surfaceRef} style={{ width: "100%", height: "100%" }} />}
      onDisconnect={() => {
        generationRef.current += 1;
        teardown();
        setStatus("disconnected");
      }}
      onReconnect={connect}
    />
  );
};

const selectableHosts = (account: TPamAccount) => {
  if (account.accountType !== PamAccountType.WindowsAd) return [];
  const { hosts } = account.connectionDetails as { hosts?: unknown };
  return Array.isArray(hosts)
    ? hosts.filter((host): host is string => typeof host === "string")
    : [];
};

export const RemoteDesktopLauncher = ({
  account,
  reason,
  mfaSessionId,
  preselectedHost
}: TSessionProps & { preselectedHost?: string }) => {
  const hosts = selectableHosts(account);
  const validPreselected =
    preselectedHost && hosts.includes(preselectedHost) ? preselectedHost : undefined;
  const [selectedHost, setSelectedHost] = useState(
    validPreselected ?? (hosts.length > 1 ? undefined : hosts[0])
  );
  const [pendingHost, setPendingHost] = useState(hosts[0] ?? "");

  if (hosts.length > 1 && !selectedHost)
    return (
      <AccessCard
        title="Select a host"
        footer={
          <Button
            disabledReason={pendingHost ? undefined : "Select a host first"}
            onClick={() => setSelectedHost(pendingHost)}
          >
            Connect
          </Button>
        }
      >
        <Field label="Host">
          <Select
            aria-label="Host"
            value={pendingHost}
            onValueChange={setPendingHost}
            options={hosts.map((host) => ({ value: host, label: host }))}
          />
        </Field>
      </AccessCard>
    );

  return (
    <RemoteDesktopSession
      account={account}
      reason={reason}
      mfaSessionId={mfaSessionId}
      selectedHost={selectedHost}
    />
  );
};
