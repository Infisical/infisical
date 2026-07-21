import { ReactNode, useEffect, useState } from "react";
import ReactCodeInput from "react-code-input";
import { startAuthentication } from "@simplewebauthn/browser";
import { useParams } from "@tanstack/react-router";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import Error from "@app/components/basic/Error";
import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v2";
import { isMfaLockoutError, stashMfaLockoutError } from "@app/helpers/mfaSession";
import { MfaMethod } from "@app/hooks/api/auth/types";
import {
  MfaSessionStatus,
  useMfaSessionStatus,
  useVerifyMfaSession
} from "@app/hooks/api/mfaSession";
import { useGenerateAuthenticationOptions, useVerifyAuthentication } from "@app/hooks/api/webauthn";

const codeInputProps = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "55px",
    borderRadius: "5px",
    fontSize: "24px",
    height: "55px",
    paddingLeft: "7",
    backgroundColor: "#0d1117",
    color: "white",
    border: "1px solid #2d2f33",
    textAlign: "center",
    outlineColor: "#8ca542",
    borderColor: "#2d2f33"
  }
} as const;

const codeInputPropsPhone = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "40px",
    borderRadius: "5px",
    fontSize: "24px",
    height: "40px",
    paddingLeft: "7",
    backgroundColor: "#0d1117",
    color: "white",
    border: "1px solid #2d2f33",
    textAlign: "center",
    outlineColor: "#8ca542",
    borderColor: "#2d2f33"
  }
} as const;

const MfaAuthPage = ({ children }: { children: ReactNode }) => (
  <AuthPageLayout contentClassName="max-w-2xl" showFooter={false}>
    <AuthPagePanel className="flex flex-col items-center">{children}</AuthPagePanel>
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

  const handleVerifyMfa = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
        <div className="mb-6 text-center">
          <h2 className="mb-3 text-xl font-medium text-red-400">Session Expired</h2>
          <p className="text-bunker-300">
            This MFA session has expired or is invalid. Please try your action again.
          </p>
        </div>
      </MfaAuthPage>
    );
  }

  if (!sessionStatus) {
    return (
      <MfaAuthPage>
        <div className="mb-4 text-center text-bunker-300">Loading...</div>
      </MfaAuthPage>
    );
  }

  if (sessionStatus.status === MfaSessionStatus.ACTIVE) {
    return (
      <MfaAuthPage>
        <div className="mb-6 text-center">
          <h2 className="mb-3 text-xl font-medium text-bunker-50">Verification Complete</h2>
          <p className="text-bunker-300">This window will close automatically...</p>
        </div>
      </MfaAuthPage>
    );
  }

  return (
    <MfaAuthPage>
      <div className="w-full">
        <div className="mb-8 text-center">
          <h2 className="mb-3 text-xl font-medium text-bunker-100">Two-Factor Authentication</h2>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-bunker-300">
            {sessionStatus.mfaMethod === MfaMethod.EMAIL &&
              "Enter the verification code sent to your email"}
            {sessionStatus.mfaMethod === MfaMethod.TOTP &&
              "Enter the verification code from your authenticator app"}
            {sessionStatus.mfaMethod === MfaMethod.WEBAUTHN &&
              "Use your registered passkey to complete two-factor authentication"}
          </p>
        </div>

        {sessionStatus.mfaMethod === MfaMethod.WEBAUTHN ? (
          <>
            {error && <Error text={error} />}
            <div className="mx-auto mt-6 flex w-full max-w-sm flex-col items-center justify-center text-center">
              <Button
                size="md"
                onClick={handleWebAuthnVerification}
                isFullWidth
                className="h-11 rounded-lg font-medium shadow-xs transition-all duration-200 hover:shadow-md"
                colorSchema="primary"
                variant="outline_bg"
                isLoading={isLoading}
              >
                Authenticate with Passkey
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={handleVerifyMfa}>
            <div className="mx-auto hidden md:block" style={{ minWidth: "600px" }}>
              <div className="mt-8 mb-6 flex justify-center">
                <ReactCodeInput
                  key={`code-input-desktop-${codeInputKey}`}
                  name=""
                  inputMode="tel"
                  type="text"
                  fields={getExpectedCodeLength()}
                  onChange={setMfaCode}
                  value={mfaCode}
                  className="mb-2"
                  {...codeInputProps}
                />
              </div>
            </div>
            <div className="mx-auto mt-4 block md:hidden" style={{ minWidth: "400px" }}>
              <div className="mt-4 mb-6 flex justify-center">
                <ReactCodeInput
                  key={`code-input-phone-${codeInputKey}`}
                  name=""
                  inputMode="tel"
                  type="text"
                  fields={getExpectedCodeLength()}
                  onChange={setMfaCode}
                  value={mfaCode}
                  className="mb-2"
                  {...codeInputPropsPhone}
                />
              </div>
            </div>
            {error && <Error text={error} />}
            <div className="mx-auto mt-6 flex w-full max-w-sm flex-col items-center justify-center text-center">
              <Button
                size="md"
                type="submit"
                isFullWidth
                className="h-11 rounded-lg font-medium shadow-xs transition-all duration-200 hover:shadow-md"
                colorSchema="primary"
                variant="outline_bg"
                isLoading={isLoading}
                isDisabled={!isCodeComplete}
              >
                Verify
              </Button>
            </div>
          </form>
        )}
      </div>
    </MfaAuthPage>
  );
};
