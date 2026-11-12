import { useEffect, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Snippet } from "@infisical/cipher/ui/snippet";
import { toast } from "@infisical/cipher/ui/sonner";
import { Text } from "@infisical/cipher/ui/text";
import QRCode from "qrcode";

import { getMfaStepUpChallenge, TMfaStepUpChallenge } from "@app/helpers/mfaSession";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { useEnrollMfa, useGetUserTotpRegistration } from "@app/hooks/api/users";
import { useRegisterPasskey } from "@app/hooks/api/webauthn";

import type { MfaEnrollmentAdapter } from "../../data/personal/contract";
import { CodeForm } from "./CodeForm";
import { MFA_CHALLENGE_PROMPTS, MfaSessionChallenge } from "./MfaSessionChallenge";

import styles from "../auth.module.css";

const liveEnrollment: MfaEnrollmentAdapter = {
  useTotpRegistration: useGetUserTotpRegistration,
  useEnrollMfa,
  useRegisterPasskey
};

type VerifyProps = { onVerified: () => void | Promise<void>; api?: MfaEnrollmentAdapter };

export const EnrollmentStepUp = ({
  challenge,
  onVerified
}: VerifyProps & { challenge: TMfaStepUpChallenge }) => (
  <Stack gap={16}>
    <Text muted>
      Verify with your existing two-factor method before adding a new one.{" "}
      {MFA_CHALLENGE_PROMPTS[challenge.mfaMethod]}
    </Text>
    <MfaSessionChallenge
      key={challenge.mfaSessionId}
      mfaSessionId={challenge.mfaSessionId}
      mfaMethod={challenge.mfaMethod}
      onVerified={onVerified}
    />
  </Stack>
);

export const TotpVerify = ({ onVerified, api = liveEnrollment }: VerifyProps) => {
  const [hasRegistered, setHasRegistered] = useState(false);
  const {
    data: registration,
    isPending,
    error: registrationError,
    refetch: refetchRegistration
  } = api.useTotpRegistration({ enabled: !hasRegistered });
  const { mutateAsync: enrollMfa, isPending: isVerifying } = api.useEnrollMfa();
  const [enrollStepUpChallenge, setEnrollStepUpChallenge] = useState<TMfaStepUpChallenge | null>(
    null
  );
  const stepUpChallenge = enrollStepUpChallenge ?? getMfaStepUpChallenge(registrationError);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [totp, setTotp] = useState("");
  const [verificationError, setVerificationError] = useState<string>();

  useEffect(() => {
    if (registration?.otpUrl) {
      setHasRegistered(true);
      QRCode.toDataURL(registration.otpUrl).then(setQrCodeUrl);
    }
  }, [registration?.otpUrl]);

  const manualSecret = registration?.otpUrl?.split("secret=")[1]?.split("&")[0];

  const handleVerify = async () => {
    setVerificationError(undefined);
    try {
      await enrollMfa({ method: MfaMethod.TOTP, totp: totp.trim() });
      toast.success("Authenticator app configured");
      await onVerified();
    } catch (error) {
      const challenge = getMfaStepUpChallenge(error);
      if (challenge) {
        setEnrollStepUpChallenge(challenge);
        return;
      }
      setVerificationError("Invalid code. Please try again.");
    }
  };

  if (stepUpChallenge) {
    return (
      <EnrollmentStepUp
        challenge={stepUpChallenge}
        onVerified={async () => {
          setEnrollStepUpChallenge(null);
          if (registrationError) await refetchRegistration();
        }}
      />
    );
  }

  if (isPending) {
    return (
      <Stack gap={16} aria-label="Loading authenticator setup">
        <Skeleton className={styles.qr} />
        <Skeleton className="h-9 w-full" />
      </Stack>
    );
  }

  return (
    <Stack gap={16}>
      <Text muted>Scan the QR code with an authenticator app, then enter the code it shows.</Text>
      {qrCodeUrl ? (
        <img src={qrCodeUrl} alt="Authenticator QR code" className={styles.qr} />
      ) : (
        <div className={styles.qr} />
      )}
      {manualSecret && (
        <Snippet label="Setup key" value={manualSecret} copyLabel="Copy setup key" />
      )}
      <CodeForm
        label="Verification code"
        value={totp}
        onChange={(value) => {
          setTotp(value.replace(/\D/g, "").slice(0, 6));
          setVerificationError(undefined);
        }}
        onSubmit={handleVerify}
        isPending={isVerifying}
        error={verificationError}
      />
    </Stack>
  );
};

export const WebAuthnVerify = ({ onVerified, api = liveEnrollment }: VerifyProps) => {
  const [stepUpChallenge, setStepUpChallenge] = useState<TMfaStepUpChallenge | null>(null);
  const { registerPasskey, isRegistering } = api.useRegisterPasskey({
    onStepUpRequired: setStepUpChallenge
  });
  const { mutateAsync: enrollMfa } = api.useEnrollMfa();
  const [name, setName] = useState("");

  const handleRegister = async () => {
    const ok = await registerPasskey(name, async (registrationResponse, resolvedName) => {
      await enrollMfa({ method: MfaMethod.WEBAUTHN, registrationResponse, name: resolvedName });
    });
    if (ok) await onVerified();
  };

  if (stepUpChallenge) {
    return (
      <EnrollmentStepUp
        challenge={stepUpChallenge}
        onVerified={() => {
          setStepUpChallenge(null);
          toast.success("Verified. Select Register passkey to continue.");
        }}
      />
    );
  }

  return (
    <Stack gap={16}>
      <Text muted>Register a passkey with Face ID, Touch ID, a security key or your device.</Text>
      <Field label="Passkey name" optional>
        <Input size="lg" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Button
        type="button"
        variant="accent"
        size="lg"
        className="w-full"
        loading={isRegistering}
        onClick={handleRegister}
      >
        Register passkey
      </Button>
    </Stack>
  );
};
