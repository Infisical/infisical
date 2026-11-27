import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Laptop,
  RefreshCw,
  ShieldAlert,
  TerminalSquare,
  XCircle
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  CopyButton,
  Spinner
} from "@app/components/v3";
import {
  fetchPamDeviceVerification,
  PamAccessType,
  PamDeviceVerificationStatus,
  TPamDeviceVerification,
  TPamDeviceVerificationTicket,
  useStartPamDeviceVerification
} from "@app/hooks/api/pam";

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_FAILURES = 3;
// Matches how long the server accepts a passed check
const CHECK_VALIDITY_MS = 5 * 60 * 1000;
const CLOUD_ORIGIN = "https://app.infisical.com";

type Props = {
  accountId: string;
  onVerified: (verificationId: string) => void;
  onExpired?: () => void;
  autoStart?: boolean;
  isOptional?: boolean;
  forAutoApproval?: boolean;
  skipHint?: string;
  accessType?: PamAccessType;
};

const CheckList = ({ verification }: { verification: TPamDeviceVerification }) => (
  <div className="flex flex-col gap-3">
    {verification.device && (
      <div className="flex items-center gap-2 text-xs text-muted">
        <Laptop className="size-4 shrink-0" />
        <span className="truncate">
          {[verification.device.model, verification.device.os].filter(Boolean).join(", ")}
          {verification.device.model ? ", serial " : "Serial "}
          <span className="font-mono">{verification.device.serial}</span>
        </span>
      </div>
    )}
    {[...new Set(verification.checks?.map((check) => check.provider))].map((provider) => (
      <div key={provider} className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted">{provider}</span>
        <ul className="flex flex-col gap-2">
          {verification.checks
            ?.filter((check) => check.provider === provider)
            .map((check) => (
              <li key={check.check} className="flex items-start gap-2">
                {check.passed ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
                )}
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm text-foreground">{check.label}</span>
                  <span className="text-xs text-muted">{check.detail}</span>
                </div>
              </li>
            ))}
        </ul>
      </div>
    ))}
  </div>
);

export const DeviceVerification = ({
  accountId,
  onVerified,
  onExpired,
  autoStart,
  isOptional,
  forAutoApproval,
  skipHint,
  accessType
}: Props) => {
  const startVerification = useStartPamDeviceVerification();
  const [ticket, setTicket] = useState<TPamDeviceVerificationTicket | null>(null);
  const [result, setResult] = useState<TPamDeviceVerification | null>(null);
  const [isStale, setIsStale] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;
  // Bumped on every start and unmount so a poll from an earlier attempt can't overwrite the current one.
  const attemptRef = useRef(0);
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;

  const stopPolling = () => {
    attemptRef.current += 1;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    staleTimerRef.current = null;
  };

  const start = useCallback(async () => {
    stopPolling();
    const attempt = attemptRef.current;
    setResult(null);
    setIsStale(false);
    let next: TPamDeviceVerificationTicket;
    try {
      next = await startVerification.mutateAsync({ accountId, accessType, forAutoApproval });
    } catch {
      return;
    }
    if (attempt !== attemptRef.current) return;
    setTicket(next);
    let failures = 0;
    const handle = setInterval(async () => {
      if (attempt !== attemptRef.current) {
        clearInterval(handle);
        return;
      }
      try {
        const verification = await fetchPamDeviceVerification(next.id);
        failures = 0;
        if (attempt !== attemptRef.current) return;
        if (verification.status === PamDeviceVerificationStatus.Pending) return;
        stopPolling();
        setResult(verification);
        if (verification.status === PamDeviceVerificationStatus.Passed) {
          onVerifiedRef.current(verification.id);
          staleTimerRef.current = setTimeout(() => {
            setIsStale(true);
            onExpiredRef.current?.();
          }, CHECK_VALIDITY_MS);
        }
      } catch {
        failures += 1;
        if (attempt !== attemptRef.current || failures < MAX_POLL_FAILURES) return;
        stopPolling();
        setResult({ id: next.id, status: PamDeviceVerificationStatus.Error });
      }
    }, POLL_INTERVAL_MS);
    pollRef.current = handle;
  }, [accountId, accessType, forAutoApproval]);

  useEffect(() => {
    if (autoStart) start();
    return stopPolling;
  }, []);

  if (!ticket) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          {isOptional
            ? `You'll run one Infisical CLI command on this device to check it. ${skipHint ?? ""}`.trim()
            : "This account only allows managed devices. You'll run one Infisical CLI command on this device to check it."}
        </p>
        <Button
          variant={isOptional ? "outline" : "pam"}
          isFullWidth
          isPending={startVerification.isPending}
          onClick={start}
        >
          <TerminalSquare className="mr-1.5 size-4" />
          Verify Device
        </Button>
      </div>
    );
  }

  if (!result) {
    const domainFlag =
      window.location.origin === CLOUD_ORIGIN ? "" : ` --domain ${window.location.origin}`;
    const command = `infisical pam verify-device ${ticket.code}${domainFlag}`;
    return (
      <div className="flex flex-col gap-3">
        <span className="text-sm text-foreground">Run this in a terminal on this device:</span>
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-container px-3 py-2">
          <code className="truncate font-mono text-sm text-foreground">{command}</code>
          <CopyButton ariaLabel="Copy command" value={command} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <Spinner size="xs" />
          Waiting for the Infisical CLI. The code expires in 5 minutes.
        </div>
      </div>
    );
  }

  if (result.status === PamDeviceVerificationStatus.Passed && isStale) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="warning">
          <ShieldAlert />
          <AlertTitle>Device check expired</AlertTitle>
          <AlertDescription>
            A device check is valid for 5 minutes. Check this device again.
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          isFullWidth
          onClick={start}
          isPending={startVerification.isPending}
        >
          <RefreshCw className="mr-1.5 size-4" />
          Check Again
        </Button>
      </div>
    );
  }

  if (result.status === PamDeviceVerificationStatus.Passed) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="success">
          <CheckCircle2 />
          <AlertTitle>Device verified</AlertTitle>
        </Alert>
        <CheckList verification={result} />
      </div>
    );
  }

  if (result.status === PamDeviceVerificationStatus.Failed) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="danger">
          <ShieldAlert />
          <AlertTitle>This device doesn&apos;t meet the device policy</AlertTitle>
          <AlertDescription>
            {isOptional && skipHint
              ? `${skipHint} Or fix the failed checks and check again. Changes can take a few minutes to show up.`
              : "Fix the failed checks, then check again. Changes can take a few minutes to show up."}
          </AlertDescription>
        </Alert>
        <CheckList verification={result} />
        <Button
          variant="outline"
          isFullWidth
          onClick={start}
          isPending={startVerification.isPending}
        >
          <RefreshCw className="mr-1.5 size-4" />
          Check Again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="warning">
        <ShieldAlert />
        <AlertTitle>
          {result.status === PamDeviceVerificationStatus.Expired
            ? "Verification timed out"
            : "Couldn't verify this device"}
        </AlertTitle>
        <AlertDescription>
          {result.status === PamDeviceVerificationStatus.Expired
            ? "The code expired before the Infisical CLI checked this device. Try again for a new code."
            : (result.message ?? "Something went wrong while checking this device. Try again.")}
        </AlertDescription>
      </Alert>
      <Button variant="outline" isFullWidth onClick={start} isPending={startVerification.isPending}>
        <RefreshCw className="mr-1.5 size-4" />
        Try Again
      </Button>
    </div>
  );
};
