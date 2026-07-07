import { useEffect, useRef, useState } from "react";
import { FingerprintIcon, MailIcon } from "lucide-react";
import QRCode from "qrcode";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import { Button, Input } from "@app/components/v3";
import { MfaMethod } from "@app/hooks/api/auth/types";
import {
  useEnrollMfa,
  useGetUserTotpRegistration,
  useSendMfaEnrollmentEmailCode
} from "@app/hooks/api/users";
import { useRegisterPasskey } from "@app/hooks/api/webauthn";

type Props = {
  method: MfaMethod;
  onVerified: (recoveryCodes?: string[]) => void | Promise<void>;
};

const TotpVerify = ({ onVerified }: { onVerified: Props["onVerified"] }) => {
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
      const { recoveryCodes } = await enrollMfa({ method: MfaMethod.TOTP, totp: totp.trim() });
      createNotification({ text: "Authenticator app configured", type: "success" });
      await onVerified(recoveryCodes);
    } catch (error: any) {
      createNotification({
        text: error?.response?.data?.message || "Invalid verification code",
        type: "error"
      });
    }
  };

  if (isPending) return <ContentLoader />;

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
      <Input
        value={totp}
        onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="Enter 6-digit code"
        maxLength={6}
      />
      <Button
        variant="org"
        isPending={isVerifying}
        isDisabled={totp.trim().length !== 6}
        onClick={handleVerify}
      >
        Verify code
      </Button>
    </div>
  );
};

const EmailVerify = ({ onVerified }: { onVerified: Props["onVerified"] }) => {
  const { mutateAsync: sendCode } = useSendMfaEnrollmentEmailCode();
  const { mutateAsync: enrollMfa, isPending: isVerifying } = useEnrollMfa();
  const [code, setCode] = useState("");
  const hasSentInitialCode = useRef(false);

  // Send the first code automatically when the step mounts.
  useEffect(() => {
    if (hasSentInitialCode.current) return;
    hasSentInitialCode.current = true;
    sendCode().catch(() => {
      createNotification({ text: "Failed to send verification code", type: "error" });
    });
  }, [sendCode]);

  const handleVerify = async () => {
    try {
      const { recoveryCodes } = await enrollMfa({ method: MfaMethod.EMAIL, code: code.trim() });
      createNotification({ text: "Email authentication configured", type: "success" });
      await onVerified(recoveryCodes);
    } catch (error: any) {
      createNotification({
        text: error?.response?.data?.message || "Invalid verification code",
        type: "error"
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-container p-4">
        <MailIcon className="mt-0.5 text-muted" />
        <p className="text-sm text-muted">
          We sent a one-time code to your account email. Enter it below to confirm you can receive
          codes. A code will be sent the same way each time you sign in.
        </p>
      </div>
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="Enter 6-digit code"
        maxLength={6}
      />
      <div className="flex items-center gap-3">
        <Button
          variant="org"
          isPending={isVerifying}
          isDisabled={code.trim().length !== 6}
          onClick={handleVerify}
        >
          Verify code
        </Button>
      </div>
    </div>
  );
};

const WebAuthnVerify = ({ onVerified }: { onVerified: Props["onVerified"] }) => {
  const { registerPasskey, isRegistering } = useRegisterPasskey();
  const { mutateAsync: enrollMfa } = useEnrollMfa();
  const [name, setName] = useState("");

  const handleRegister = async () => {
    let recoveryCodes: string[] | undefined;
    const ok = await registerPasskey(name, async (registrationResponse, resolvedName) => {
      const res = await enrollMfa({
        method: MfaMethod.WEBAUTHN,
        registrationResponse,
        name: resolvedName
      });
      recoveryCodes = res.recoveryCodes;
    });
    if (ok) {
      await onVerified(recoveryCodes);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Register a passkey using Face ID, Touch ID, a security key, or your device. Optionally give
        it a name so you can recognize it later.
      </p>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Passkey name (optional)"
      />
      <Button variant="org" isPending={isRegistering} onClick={handleRegister}>
        <FingerprintIcon /> Register passkey
      </Button>
    </div>
  );
};

export const VerifyStep = ({ method, onVerified }: Props) => {
  if (method === MfaMethod.TOTP) return <TotpVerify onVerified={onVerified} />;
  if (method === MfaMethod.EMAIL) return <EmailVerify onVerified={onVerified} />;
  return <WebAuthnVerify onVerified={onVerified} />;
};
