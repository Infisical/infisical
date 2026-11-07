import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import { MFA_METHOD_LABELS } from "@app/components/mfa/setup/types";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { Snippet } from "@app/components/v4/ui/snippet";
import { toast } from "@app/components/v4/ui/sonner";
import { Text } from "@app/components/v4/ui/text";
import { getMfaStepUpChallenge, TMfaStepUpChallenge } from "@app/helpers/mfaSession";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { getMfaTempToken } from "@app/hooks/api/reactQuery";
import { useEnrollMfa, useGetUserTotpRegistration } from "@app/hooks/api/users";
import { useRegisterPasskey } from "@app/hooks/api/webauthn";

import { AuthPage } from "./AuthPage";
import { CodeForm } from "./CodeForm";
import { MFA_CHALLENGE_PROMPTS, MfaSessionChallenge } from "./MfaSessionChallenge";

import styles from "../auth.module.css";

type VerifyProps = { onVerified: () => void | Promise<void> };

const EnrollmentStepUp = ({
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

const TotpVerify = ({ onVerified }: VerifyProps) => {
  const [hasRegistered, setHasRegistered] = useState(false);
  const {
    data: registration,
    isPending,
    error: registrationError,
    refetch: refetchRegistration
  } = useGetUserTotpRegistration({ enabled: !hasRegistered });
  const { mutateAsync: enrollMfa, isPending: isVerifying } = useEnrollMfa();
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

const WebAuthnVerify = ({ onVerified }: VerifyProps) => {
  const [stepUpChallenge, setStepUpChallenge] = useState<TMfaStepUpChallenge | null>(null);
  const { registerPasskey, isRegistering } = useRegisterPasskey({
    onStepUpRequired: setStepUpChallenge
  });
  const { mutateAsync: enrollMfa } = useEnrollMfa();
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

type Props = {
  method: MfaMethod;
  onComplete: () => void | Promise<void>;
  onUseRecoveryCode: () => void;
};

export const MfaEnrollment = ({ method, onComplete, onUseRecoveryCode }: Props) => {
  const hasPrepared = useRef(false);

  useEffect(() => {
    if (hasPrepared.current) return;
    hasPrepared.current = true;
    SecurityClient.setMfaToken("");
  }, []);

  const handleVerified = async () => {
    SecurityClient.setMfaToken(getMfaTempToken());
    await onComplete();
  };

  return (
    <AuthPage
      variant="focused"
      pageTitle="Two-Factor Authentication"
      title="Set up two-factor authentication"
      description={`Your organization requires ${MFA_METHOD_LABELS[method].toLowerCase()} to sign in.`}
      footer={
        <span>
          Can&apos;t access your other two-factor method?{" "}
          <button type="button" className={styles.link} onClick={onUseRecoveryCode}>
            Use a recovery code
          </button>
        </span>
      }
    >
      {method === MfaMethod.TOTP ? (
        <TotpVerify onVerified={handleVerified} />
      ) : (
        <WebAuthnVerify onVerified={handleVerified} />
      )}
    </AuthPage>
  );
};
