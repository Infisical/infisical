import { useEffect, useRef, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { FingerprintIcon } from "lucide-react";
import QRCode from "qrcode";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import { Button, Input } from "@app/components/v3";
import { MfaMethod } from "@app/hooks/api/auth/types";
import {
  useGetUserTotpRegistration,
  useSendEmailMfaSetupCode,
  useVerifyEmailMfaSetupCode,
  useVerifyUserTotpRegistration
} from "@app/hooks/api/users";
import { useGenerateRegistrationOptions, useVerifyRegistration } from "@app/hooks/api/webauthn";

type Props = {
  method: MfaMethod;
  onVerified: () => void | Promise<void>;
};

const TotpVerify = ({ onVerified }: { onVerified: Props["onVerified"] }) => {
  const { data: registration, isPending } = useGetUserTotpRegistration();
  const { mutateAsync: verifyTotp, isPending: isVerifying } = useVerifyUserTotpRegistration();
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [totp, setTotp] = useState("");

  useEffect(() => {
    if (registration?.otpUrl) {
      QRCode.toDataURL(registration.otpUrl).then(setQrCodeUrl);
    }
  }, [registration?.otpUrl]);

  const manualSecret = registration?.otpUrl?.split("secret=")[1]?.split("&")[0];

  const handleVerify = async () => {
    try {
      await verifyTotp({ totp: totp.trim() });
      createNotification({ text: "Authenticator app configured", type: "success" });
      await onVerified();
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
          <code className="rounded bg-mineshaft-700 px-2 py-0.5 font-mono text-mineshaft-100">
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

const RESEND_COOLDOWN_SECONDS = 60;

const EmailVerify = ({ onVerified }: { onVerified: Props["onVerified"] }) => {
  const { mutateAsync: sendCode } = useSendEmailMfaSetupCode();
  const { mutateAsync: verifyCode, isPending: isVerifying } = useVerifyEmailMfaSetupCode();
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const hasSentRef = useRef(false);

  const sendAndStartCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    sendCode().catch((error: any) => {
      const remaining = error?.response?.data?.details?.cooldownSeconds;
      if (typeof remaining === "number") {
        setCooldown(remaining);
        return;
      }
      setCooldown(0);
      createNotification({
        text: error?.response?.data?.message || "Failed to send verification code",
        type: "error"
      });
    });
  };

  useEffect(() => {
    if (hasSentRef.current) return;
    hasSentRef.current = true;
    sendAndStartCooldown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((remaining) => remaining - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleVerify = async () => {
    try {
      await verifyCode({ code: code.trim() });
      createNotification({ text: "Email verified", type: "success" });
      await onVerified();
    } catch {
      // The global mutation error handler surfaces the failure toast.
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        We sent a one-time code to your account email. Enter it below to confirm.
      </p>
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
        <Button variant="ghost" isDisabled={cooldown > 0} onClick={sendAndStartCooldown}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </Button>
      </div>
    </div>
  );
};

const WebAuthnVerify = ({ onVerified }: { onVerified: Props["onVerified"] }) => {
  const { mutateAsync: generateOptions } = useGenerateRegistrationOptions();
  const { mutateAsync: verifyRegistration, isPending } = useVerifyRegistration();
  const [name, setName] = useState("");

  const handleRegister = async () => {
    try {
      if (
        !window.PublicKeyCredential ||
        !window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
      ) {
        createNotification({ text: "WebAuthn is not supported on this browser", type: "error" });
        return;
      }

      const options = await generateOptions();
      const registrationResponse = await startRegistration({ optionsJSON: options });
      await verifyRegistration({ registrationResponse, name: name.trim() || "Passkey" });

      createNotification({ text: "Passkey registered", type: "success" });
      await onVerified();
    } catch (error: any) {
      let text = "Failed to register passkey";
      if (error.name === "NotAllowedError")
        text = "Passkey registration was cancelled or timed out";
      else if (error.name === "InvalidStateError")
        text = "This passkey has already been registered";
      else if (error?.response?.data?.message) text = error.response.data.message;
      else if (error.message) text = error.message;
      createNotification({ text, type: "error" });
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
      <Button variant="org" isPending={isPending} onClick={handleRegister}>
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
