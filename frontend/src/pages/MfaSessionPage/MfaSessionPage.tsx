import { useEffect, useState } from "react";
import ReactCodeInput from "react-code-input";
import { startAuthentication } from "@simplewebauthn/browser";
import { useParams } from "@tanstack/react-router";

import Error from "@app/components/basic/Error";
import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v2";
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

export const MfaSessionPage = () => {
  const { mfaSessionId } = useParams({ strict: false }) as { mfaSessionId: string };

  const [mfaCode, setMfaCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(err?.response?.data?.message || "Invalid MFA code. Please try again.");
      setMfaCode("");
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-bunker-800 bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
        <div className="mx-auto w-max pt-6 pb-6 md:mb-16 md:px-8">
          <div className="mb-4 flex justify-center">
            <img src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical logo" />
          </div>
          <div className="mb-6 text-center">
            <h2 className="mb-3 text-xl font-medium text-red-400">Session Expired</h2>
            <p className="text-bunker-300">
              This MFA session has expired or is invalid. Please try your action again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!sessionStatus) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bunker-800 bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
        <div className="text-center">
          <div className="mb-4 text-bunker-300">Loading...</div>
        </div>
      </div>
    );
  }

  if (sessionStatus.status === MfaSessionStatus.ACTIVE) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bunker-800 bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
        <div className="mx-auto w-max pt-6 pb-6 md:mb-16 md:px-8">
          <div className="mb-4 flex justify-center">
            <img src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical logo" />
          </div>
          <div className="mb-6 text-center">
            <h2 className="mb-3 text-xl font-medium text-bunker-50">Verification Complete</h2>
            <p className="text-bunker-300">This window will close automatically...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bunker-800 bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
      <div className="mx-auto w-max pt-6 pb-6 md:mb-16 md:px-8">
        <div className="mb-4 flex justify-center">
          <img src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical logo" />
        </div>

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
    </div>
  );
};
