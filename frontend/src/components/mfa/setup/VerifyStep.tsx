import { useEffect, useState } from "react";
import { FingerprintIcon } from "lucide-react";
import QRCode from "qrcode";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Skeleton,
  VerificationCodeForm
} from "@app/components/v3";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { useEnrollMfa, useGetUserTotpRegistration } from "@app/hooks/api/users";
import { useRegisterPasskey } from "@app/hooks/api/webauthn";

type Props = {
  method: MfaMethod;
  onVerified: () => void | Promise<void>;
  variant?: React.ComponentProps<typeof Button>["variant"];
};

const TotpVerify = ({
  onVerified,
  variant
}: {
  onVerified: Props["onVerified"];
  variant: Props["variant"];
}) => {
  const [hasRegistered, setHasRegistered] = useState(false);
  const { data: registration, isPending } = useGetUserTotpRegistration({ enabled: !hasRegistered });
  const { mutateAsync: enrollMfa, isPending: isVerifying } = useEnrollMfa();
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [totp, setTotp] = useState("");

  useEffect(() => {
    if (registration?.otpUrl) {
      setHasRegistered(true);
      QRCode.toDataURL(registration.otpUrl).then(setQrCodeUrl);
    }
  }, [registration?.otpUrl]);

  const manualSecret = registration?.otpUrl?.split("secret=")[1]?.split("&")[0];

  const handleVerify = async () => {
    try {
      await enrollMfa({ method: MfaMethod.TOTP, totp: totp.trim() });
      createNotification({ text: "Authenticator app configured", type: "success" });
      await onVerified();
    } catch {
      // The mutation's global error handler already surfaces the (more detailed)
      // failure toast; just swallow here so onVerified isn't called on failure.
    }
  };

  if (isPending) {
    return (
      <div className="space-y-4" aria-label="Loading authenticator setup">
        <Skeleton className="mx-auto h-44 w-44" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Scan the QR code with an authenticator app, then enter the 6-digit code it generates.
      </p>
      <div className="flex items-center justify-center rounded-lg bg-white p-4">
        {qrCodeUrl ? (
          <img src={qrCodeUrl} alt="Authenticator QR code" className="h-44 w-44" />
        ) : (
          <div className="h-44 w-44" />
        )}
      </div>
      {manualSecret && (
        <p className="text-xs text-muted">
          Can&apos;t scan? Enter this key manually:{" "}
          <code className="rounded border border-border bg-container px-2 py-0.5 font-mono text-foreground">
            {manualSecret}
          </code>
        </p>
      )}
      <VerificationCodeForm
        name="totp-enrollment-code"
        value={totp}
        onChange={(value) => setTotp(value.replace(/\D/g, "").slice(0, 6))}
        onSubmit={handleVerify}
        submitLabel="Verify code"
        submitVariant={variant}
        isPending={isVerifying}
      />
    </div>
  );
};

const WebAuthnVerify = ({
  onVerified,
  variant
}: {
  onVerified: Props["onVerified"];
  variant: Props["variant"];
}) => {
  const { registerPasskey, isRegistering } = useRegisterPasskey();
  const { mutateAsync: enrollMfa } = useEnrollMfa();
  const [name, setName] = useState("");

  const handleRegister = async () => {
    const ok = await registerPasskey(name, async (registrationResponse, resolvedName) => {
      await enrollMfa({
        method: MfaMethod.WEBAUTHN,
        registrationResponse,
        name: resolvedName
      });
    });
    if (ok) {
      await onVerified();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Register a passkey using Face ID, Touch ID, a security key, or your device. Optionally give
        it a name so you can recognize it later.
      </p>
      <Field>
        <FieldLabel htmlFor="mfa-passkey-name">Passkey name</FieldLabel>
        <Input
          id="mfa-passkey-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Optional"
        />
        <FieldDescription>Use a name that helps you recognize this device.</FieldDescription>
      </Field>
      <Button variant={variant} isPending={isRegistering} onClick={handleRegister}>
        <FingerprintIcon /> Register passkey
      </Button>
    </div>
  );
};

export const VerifyStep = ({ method, onVerified, variant = "project" }: Props) => {
  if (method === MfaMethod.TOTP) return <TotpVerify onVerified={onVerified} variant={variant} />;
  return <WebAuthnVerify onVerified={onVerified} variant={variant} />;
};
