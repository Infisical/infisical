import { useEffect, useReducer, useRef, useState } from "react";
import { ClipboardCheck, Copy, Eye, EyeOff, ShieldCheck } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ButtonGroup,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  IconButton,
  Input,
  TextArea
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import {
  PamAccountType,
  TPamAccountCredentials,
  usePamAccountCredentials,
  usePamAccountTypeMap
} from "@app/hooks/api/pam";

import { extractMfaSessionId, useMfaChallenge } from "../../components/useMfaChallenge";

type Props = {
  accountId?: string;
  accountName?: string;
  accountType?: PamAccountType;
  requireReason: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

const MFA_FAILURE_MESSAGE = {
  blocked:
    "Your browser blocked the MFA verification window. Allow popups for this site, then try again.",
  failed: "MFA verification timed out or failed. Please try again."
} as const;

const CredentialField = ({
  label,
  value,
  isSecret
}: {
  label: string;
  value: string;
  isSecret: boolean;
}) => {
  const [isRevealed, toggleRevealed] = useReducer((prev) => !prev, false);
  const [, isCopied, setCopied] = useTimedReset<boolean>({ initialState: false });
  const isMasked = isSecret && !isRevealed;

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldContent>
        <ButtonGroup className="w-full">
          <Input
            value={value}
            type={isMasked ? "password" : "text"}
            readOnly
            aria-label={label}
            className="font-mono"
          />
          {isSecret && (
            <IconButton
              variant="outline"
              aria-label={`${isRevealed ? "Hide" : "Reveal"} ${label}`}
              onClick={toggleRevealed}
            >
              {isRevealed ? <EyeOff /> : <Eye />}
            </IconButton>
          )}
          <IconButton
            variant="outline"
            aria-label={`Copy ${label}`}
            onClick={() => {
              navigator.clipboard.writeText(value);
              setCopied(true);
            }}
          >
            {isCopied ? <ClipboardCheck /> : <Copy />}
          </IconButton>
        </ButtonGroup>
      </FieldContent>
    </Field>
  );
};

export const ViewCredentialsModal = ({
  accountId,
  accountName,
  accountType,
  requireReason,
  isOpen,
  onOpenChange
}: Props) => {
  const { map } = usePamAccountTypeMap();
  const runMfaChallenge = useMfaChallenge();
  const fetchCredentials = usePamAccountCredentials();

  const [reason, setReason] = useState("");
  const [credentials, setCredentials] = useState<TPamAccountCredentials>();
  const [errorMessage, setErrorMessage] = useState("");
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false);

  const openAccountId = useRef(accountId);

  useEffect(() => {
    openAccountId.current = accountId;
    if (!isOpen) {
      setReason("");
      setCredentials(undefined);
      setErrorMessage("");
      setIsVerifyingMfa(false);
    }
  }, [isOpen, accountId]);

  // Recurses at most once: a retry already carrying an MFA session never re-enters the challenge
  const reveal = async (mfaSessionId?: string) => {
    if (!accountId) return;
    const isStale = () => openAccountId.current !== accountId;
    setErrorMessage("");

    try {
      const revealed = await fetchCredentials.mutateAsync({
        accountId,
        reason: reason.trim() || undefined,
        mfaSessionId
      });
      if (!isStale()) setCredentials(revealed);
    } catch (err) {
      if (isStale()) return;

      const challengeId = mfaSessionId ? undefined : extractMfaSessionId(err);
      if (!challengeId) return;

      setIsVerifyingMfa(true);
      const outcome = await runMfaChallenge(challengeId);
      if (isStale()) return;

      setIsVerifyingMfa(false);
      if (outcome === "verified") await reveal(challengeId);
      else setErrorMessage(MFA_FAILURE_MESSAGE[outcome]);
    }
  };

  const descriptors = new Map(
    (accountType ? (map[accountType]?.credentialFields ?? []) : []).map((f) => [f.key, f])
  );
  const fields = Object.entries(credentials?.credentials ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Account Credentials</DialogTitle>
          <DialogDescription>
            {credentials
              ? `Stored credentials for ${accountName}. Copying one takes it outside Infisical, where no session recording applies.`
              : `Reveal the stored credentials for ${accountName}. Every reveal is recorded in the audit log.`}
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <Alert variant="danger">
            <AlertTitle>MFA verification incomplete</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {isVerifyingMfa && (
          <Alert variant="info">
            <ShieldCheck />
            <AlertTitle>Waiting for MFA verification</AlertTitle>
            <AlertDescription>
              Complete the verification in the popup window. Leave this dialog open.
            </AlertDescription>
          </Alert>
        )}

        {credentials ? (
          <div className="flex flex-col gap-4">
            {fields.length === 0 && (
              <p className="text-sm text-muted">This account has no credential configured yet.</p>
            )}
            {fields.map(([key, value]) => (
              <CredentialField
                key={key}
                label={descriptors.get(key)?.label ?? key}
                value={value}
                // Unknown keys have no descriptor, so mask them rather than leaking a secret in the clear
                isSecret={descriptors.get(key)?.secret ?? true}
              />
            ))}
          </div>
        ) : (
          <Field>
            <FieldLabel>
              Reason{!requireReason && <span className="ml-1 text-xs text-muted">(optional)</span>}
            </FieldLabel>
            <FieldContent>
              <TextArea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why do you need this credential?"
                rows={3}
                maxLength={500}
              />
            </FieldContent>
          </Field>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {credentials ? "Close" : "Cancel"}
          </Button>
          {!credentials && (
            <Button
              variant="pam"
              isPending={fetchCredentials.isPending || isVerifyingMfa}
              isDisabled={requireReason && !reason.trim()}
              onClick={() => reveal()}
            >
              <Eye />
              Reveal
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
