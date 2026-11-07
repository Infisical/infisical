import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";

import { Button } from "@app/components/v4/ui/button";
import { FieldError } from "@app/components/v4/ui/field";
import { Stack } from "@app/components/v4/ui/layout";
import { isMfaLockoutError } from "@app/helpers/mfaSession";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { useVerifyMfaSession } from "@app/hooks/api/mfaSession";
import { useGenerateAuthenticationOptions, useVerifyAuthentication } from "@app/hooks/api/webauthn";

import { CodeForm } from "./CodeForm";

export const MFA_CHALLENGE_PROMPTS: Record<MfaMethod, string> = {
  [MfaMethod.EMAIL]: "Enter the verification code sent to your email.",
  [MfaMethod.TOTP]: "Enter the verification code from your authenticator app.",
  [MfaMethod.WEBAUTHN]: "Use your registered passkey to continue."
};

type Props = {
  mfaSessionId: string;
  mfaMethod: MfaMethod;
  onVerified: () => void | Promise<void>;
  onLockout?: (message: string) => void;
};

export const MfaSessionChallenge = ({ mfaSessionId, mfaMethod, onVerified, onLockout }: Props) => {
  const [mfaCode, setMfaCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeFormKey, setCodeFormKey] = useState(0);

  const verifyMfaSession = useVerifyMfaSession();
  const { mutateAsync: generateWebAuthnAuthenticationOptions } = useGenerateAuthenticationOptions();
  const { mutateAsync: verifyWebAuthnAuthentication } = useVerifyAuthentication();

  const handleLockout = (err: unknown) => {
    if (!onLockout || !isMfaLockoutError(err)) return false;
    onLockout(err.response.data.message);
    return true;
  };

  const handleVerifyCode = async () => {
    if (mfaCode.trim().length !== 6) return;
    setIsLoading(true);
    setError(null);
    try {
      await verifyMfaSession.mutateAsync({ mfaSessionId, mfaToken: mfaCode.trim(), mfaMethod });
      await onVerified();
    } catch (err: any) {
      if (handleLockout(err)) return;
      setError(err?.response?.data?.message || "Invalid MFA code. Please try again.");
      setMfaCode("");
      setCodeFormKey((key) => key + 1);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPasskey = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const options = await generateWebAuthnAuthenticationOptions();
      const authenticationResponse = await startAuthentication({ optionsJSON: options });
      const result = await verifyWebAuthnAuthentication({ authenticationResponse });
      if (result.sessionToken) {
        await verifyMfaSession.mutateAsync({
          mfaSessionId,
          mfaToken: result.sessionToken,
          mfaMethod: MfaMethod.WEBAUTHN
        });
        await onVerified();
      }
    } catch (err: any) {
      if (handleLockout(err)) return;
      let errorMessage = "Failed to verify passkey";
      if (err.name === "NotAllowedError") {
        errorMessage = "Passkey verification was cancelled or timed out";
      } else if (err?.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (mfaMethod === MfaMethod.WEBAUTHN) {
    return (
      <Stack gap={8}>
        <Button
          type="button"
          variant="accent"
          size="lg"
          className="w-full"
          loading={isLoading}
          onClick={handleVerifyPasskey}
        >
          Authenticate with passkey
        </Button>
        {error && <FieldError>{error}</FieldError>}
      </Stack>
    );
  }

  return (
    <CodeForm
      key={codeFormKey}
      label="Verification code"
      value={mfaCode}
      onChange={setMfaCode}
      onSubmit={handleVerifyCode}
      isPending={isLoading}
      error={error ?? undefined}
    />
  );
};
