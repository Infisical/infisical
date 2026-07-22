import { ReactNode, useEffect, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useParams } from "@tanstack/react-router";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  CardContent,
  FieldError,
  VerificationCodeForm,
  VerificationCodeHeader
} from "@app/components/v3";
import { isMfaLockoutError, stashMfaLockoutError } from "@app/helpers/mfaSession";
import { MfaMethod } from "@app/hooks/api/auth/types";
import {
  MfaSessionStatus,
  useMfaSessionStatus,
  useVerifyMfaSession
} from "@app/hooks/api/mfaSession";
import { useGenerateAuthenticationOptions, useVerifyAuthentication } from "@app/hooks/api/webauthn";

const MfaAuthPage = ({ children }: { children: ReactNode }) => (
  <AuthPageLayout showFooter={false}>
    <AuthPagePanel>{children}</AuthPagePanel>
  </AuthPageLayout>
);

export const MfaSessionPage = () => {
  const { mfaSessionId } = useParams({ strict: false }) as { mfaSessionId: string };

  const [mfaCode, setMfaCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeInputKey, setCodeInputKey] = useState(0);

  const { data: sessionStatus, isError: isStatusError } = useMfaSessionStatus(mfaSessionId);
  const verifyMfaSession = useVerifyMfaSession();
  const { mutateAsync: generateWebAuthnAuthenticationOptions } = useGenerateAuthenticationOptions();
  const { mutateAsync: verifyWebAuthnAuthentication } = useVerifyAuthentication();

  // Show notification and auto-close when MFA is completed
  useEffect(() => {
    if (sessionStatus?.status === MfaSessionStatus.ACTIVE) {
      createNotification({
        text: "MFA verification successful! Closing window...",
        type: "success"
      });

      // Auto-close window after showing success message
      setTimeout(() => {
        window.close();
      }, 1000);
    }
  }, [sessionStatus?.status]);

  // Handle status error (session not found or expired)
  useEffect(() => {
    if (isStatusError) {
      setError("MFA session not found or expired. Please try again.");
    }
  }, [isStatusError]);

  const getExpectedCodeLength = () => {
    if (sessionStatus?.mfaMethod === MfaMethod.EMAIL) return 6;
    if (sessionStatus?.mfaMethod === MfaMethod.TOTP) return 6;
    return 6;
  };

  const isCodeComplete = mfaCode.length === getExpectedCodeLength();

  const handleVerifyMfa = async () => {
    if (!mfaCode.trim() || !isCodeComplete || !sessionStatus?.mfaMethod) return;

    setIsLoading(true);
    setError(null);

    try {
      await verifyMfaSession.mutateAsync({
        mfaSessionId,
        mfaToken: mfaCode.trim(),
        mfaMethod: sessionStatus.mfaMethod
      });

      createNotification({
        text: "MFA verification successful! Closing window...",
        type: "success"
      });

      // Auto-close window after showing success message
      setTimeout(() => {
        window.close();
      }, 1000);
    } catch (err: any) {
      if (isMfaLockoutError(err)) {
        stashMfaLockoutError(mfaSessionId, err.response.data.message);
        window.close();
        return;
      }

      setError(err?.response?.data?.message || "Invalid MFA code. Please try again.");
      setMfaCode("");
      setCodeInputKey((key) => key + 1);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWebAuthnVerification = async () => {
    if (!sessionStatus?.mfaMethod) return;

    setIsLoading(true);
    setError(null);

    try {
      // Get authentication options from server
      const options = await generateWebAuthnAuthenticationOptions();

      // Prompt user to authenticate with their passkey
      const authenticationResponse = await startAuthentication({ optionsJSON: options });

      // Verify with server to get session token
      const result = await verifyWebAuthnAuthentication({ authenticationResponse });

      // Use the sessionToken to verify MFA session
      if (result.sessionToken) {
        await verifyMfaSession.mutateAsync({
          mfaSessionId,
          mfaToken: result.sessionToken,
          mfaMethod: MfaMethod.WEBAUTHN
        });

        createNotification({
          text: "MFA verification successful! Closing window...",
          type: "success"
        });

        // Auto-close window after showing success message
        setTimeout(() => {
          window.close();
        }, 1000);
      }
    } catch (err: any) {
      if (isMfaLockoutError(err)) {
        stashMfaLockoutError(mfaSessionId, err.response.data.message);
        window.close();
        return;
      }

      console.error("WebAuthn verification failed:", err);

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

  if (isStatusError) {
    return (
      <MfaAuthPage>
        <VerificationCodeHeader
          title={<span className="text-danger">Session expired</span>}
          description="This MFA session has expired or is invalid. Please try your action again."
        />
      </MfaAuthPage>
    );
  }

  if (!sessionStatus) {
    return (
      <MfaAuthPage>
        <VerificationCodeHeader title="Loading verification…" />
      </MfaAuthPage>
    );
  }

  if (sessionStatus.status === MfaSessionStatus.ACTIVE) {
    return (
      <MfaAuthPage>
        <VerificationCodeHeader
          title="Verification complete"
          description="This window will close automatically…"
        />
      </MfaAuthPage>
    );
  }

  return (
    <MfaAuthPage>
      <VerificationCodeHeader
        title="Two-factor authentication"
        description={
          <>
            {sessionStatus.mfaMethod === MfaMethod.EMAIL &&
              "Enter the verification code sent to your email."}
            {sessionStatus.mfaMethod === MfaMethod.TOTP &&
              "Enter the verification code from your authenticator app."}
            {sessionStatus.mfaMethod === MfaMethod.WEBAUTHN &&
              "Use your registered passkey to continue."}
          </>
        }
      />

      <CardContent className="flex flex-col gap-5">
        {sessionStatus.mfaMethod === MfaMethod.WEBAUTHN ? (
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              onClick={handleWebAuthnVerification}
              isFullWidth
              variant="project"
              isPending={isLoading}
              isDisabled={isLoading}
            >
              Authenticate with passkey
            </Button>
            {error && <FieldError>{error}</FieldError>}
          </div>
        ) : (
          <VerificationCodeForm
            key={codeInputKey}
            name="mfa-session-code"
            value={mfaCode}
            onChange={setMfaCode}
            onSubmit={() => handleVerifyMfa()}
            isPending={isLoading}
            error={error}
          />
        )}
      </CardContent>
    </MfaAuthPage>
  );
};
