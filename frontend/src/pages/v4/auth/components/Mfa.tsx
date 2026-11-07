import { useEffect, useRef, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useNavigate } from "@tanstack/react-router";

import { waitForMinimumAuthVerificationLoading } from "@app/components/auth/authTiming";
import { MFA_METHOD_LABELS } from "@app/components/mfa/setup/types";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Alert } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { toast } from "@app/components/v4/ui/sonner";
import { Text } from "@app/components/v4/ui/text";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useActivateMfa, useLogoutUser, useSendMfaToken } from "@app/hooks/api";
import {
  checkUserTotpMfa,
  checkUserWebAuthnMfa,
  verifyMfaToken,
  verifyRecoveryCode
} from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { getMfaTempToken } from "@app/hooks/api/reactQuery";
import { fetchUserDetails } from "@app/hooks/api/users/queries";
import { useGenerateAuthenticationOptions, useVerifyAuthentication } from "@app/hooks/api/webauthn";

import { AuthPage } from "./AuthPage";
import { CodeForm } from "./CodeForm";
import { MfaEnrollment } from "./MfaEnrollment";
import { RecoveryCodes } from "./RecoveryCodes";

import styles from "../auth.module.css";

const MAX_MFA_ATTEMPTS = 5;
const CLIENT_RESEND_DELAY_SECONDS = 20;

type Props = {
  successCallback: (options?: { needsFactorSetup?: boolean }) => void | Promise<void>;
  email: string;
  method: MfaMethod;
  onChangeAccount?: () => void | Promise<void>;
  preview?: "code" | "recovery" | "passkey" | "codes";
};

const PREVIEW_RECOVERY_CODES = [
  "7k2m9qxa",
  "p4w8z1rd",
  "c6n3t7ve",
  "h9j2b5ly",
  "x3f8q6ms",
  "r1d7k4wu",
  "g5v2n8ze",
  "t8c4p1jo",
  "m2y6h9fb",
  "w7s3e5ik"
];

export const Mfa = ({ successCallback, email, method, onChangeAccount, preview }: Props) => {
  const navigate = useNavigate();
  const [mfaCode, setMfaCode] = useState("");
  const [showRecoveryCodeInput, setShowRecoveryCodeInput] = useState(preview === "recovery");
  const [resendDelayEnd, setResendDelayEnd] = useState(() =>
    method === MfaMethod.EMAIL ? Date.now() + CLIENT_RESEND_DELAY_SECONDS * 1000 : 0
  );
  const [, forceRender] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingResend, setIsLoadingResend] = useState(false);
  const [triesLeft, setTriesLeft] = useState<number | undefined>(undefined);
  const [shouldShowTotpRegistration, setShouldShowTotpRegistration] = useState(false);
  const [shouldShowWebAuthnRegistration, setShouldShowWebAuthnRegistration] = useState(false);
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(
    preview === "codes" ? PREVIEW_RECOVERY_CODES : null
  );
  const wasMfaEnabledRef = useRef(true);
  const mfaTokenRef = useRef(getMfaTempToken());
  const [isRecoveringFromSetup, setIsRecoveringFromSetup] = useState(false);
  const { mutateAsync: activateMfa } = useActivateMfa();
  const logout = useLogoutUser();
  const { mutateAsync: generateWebAuthnAuthenticationOptions } = useGenerateAuthenticationOptions();
  const { mutateAsync: verifyWebAuthnAuthentication } = useVerifyAuthentication();
  const sendMfaToken = useSendMfaToken();
  const remainingResendSeconds = Math.max(0, Math.ceil((resendDelayEnd - Date.now()) / 1000));

  useEffect(() => {
    if (remainingResendSeconds <= 0) return undefined;
    const timer = window.setInterval(() => forceRender((x) => x + 1), 1000);
    return () => window.clearInterval(timer);
  }, [remainingResendSeconds > 0]);

  useEffect(() => {
    if (preview) return;
    fetchUserDetails()
      .then((user) => {
        wasMfaEnabledRef.current = Boolean(user.isMfaEnabled);
      })
      .catch(() => {});

    if (method === MfaMethod.TOTP) {
      checkUserTotpMfa().then((isVerified) => {
        if (!isVerified) {
          SecurityClient.setMfaToken("");
          setShouldShowTotpRegistration(true);
        }
      });
    } else if (method === MfaMethod.WEBAUTHN) {
      checkUserWebAuthnMfa().then((hasPasskeys) => {
        if (!hasPasskeys) setShouldShowWebAuthnRegistration(true);
      });
    }
  }, [method]);

  const expectedCodeLength = showRecoveryCodeInput ? 8 : 6;
  const isLockedOut = typeof triesLeft === "number" && triesLeft <= 0;

  const showFactorSetup = () => {
    if (method === MfaMethod.TOTP) setShouldShowTotpRegistration(true);
    else setShouldShowWebAuthnRegistration(true);
  };

  const switchToRecoveryCode = () => {
    SecurityClient.setMfaToken(mfaTokenRef.current);
    setShouldShowTotpRegistration(false);
    setShouldShowWebAuthnRegistration(false);
    setShowRecoveryCodeInput(true);
    setIsRecoveringFromSetup(true);
  };

  let recoveryToggleLabel = "Use authenticator code";
  if (isRecoveringFromSetup) recoveryToggleLabel = "Back to setup";
  else if (!showRecoveryCodeInput) recoveryToggleLabel = "Use a recovery code";
  else if (method === MfaMethod.WEBAUTHN) recoveryToggleLabel = "Use passkey instead";
  else if (method === MfaMethod.EMAIL) recoveryToggleLabel = "Use email code";

  const completeLogin = async () => {
    await successCallback({ needsFactorSetup: isRecoveringFromSetup });
    if (isRecoveringFromSetup) {
      toast.info(
        `Set up your ${MFA_METHOD_LABELS[method].toLowerCase()} in Personal Settings. Your organization requires it to sign in.`
      );
    }
  };

  const finalizeAfterMfaVerification = async (
    sessionToken: string,
    mfaMethod: MfaMethod,
    isRecoveryCodeFlow: boolean
  ) => {
    setTriesLeft(undefined);
    SecurityClient.setMfaToken("");
    SecurityClient.setToken(sessionToken);

    if (!isRecoveryCodeFlow && !wasMfaEnabledRef.current) {
      try {
        const { recoveryCodes } = await activateMfa({ selectedMfaMethod: mfaMethod });
        setNewRecoveryCodes(recoveryCodes);
        return;
      } catch {
        toast.error(
          "Your identity was verified, but two-factor setup couldn't be completed. You can set up recovery codes later from your account security settings."
        );
      }
    }

    await completeLogin();
  };

  const lockOut = async (text: string) => {
    toast.error(text);
    SecurityClient.setMfaToken("");
    SecurityClient.setToken("");
    SecurityClient.setSignupToken("");
    await logout.mutateAsync();
    navigate({ to: "/v4/login" });
  };

  const countFailedAttempt = async (lockoutText: string) => {
    if (typeof triesLeft !== "number") {
      setTriesLeft(MAX_MFA_ATTEMPTS - 1);
      return false;
    }
    const newTriesLeft = triesLeft - 1;
    setTriesLeft(newTriesLeft);
    if (newTriesLeft > 0) return false;
    await lockOut(lockoutText);
    return true;
  };

  const verifyMfa = async () => {
    if (preview || !mfaCode.trim() || mfaCode.length !== expectedCodeLength) return;
    const verificationStartedAt = Date.now();
    setIsLoading(true);

    let sessionToken: string;
    try {
      const result = showRecoveryCodeInput
        ? await verifyRecoveryCode(mfaCode.trim())
        : await verifyMfaToken({ email, mfaCode: mfaCode.trim(), mfaMethod: method });
      sessionToken = result.token;
    } catch {
      const isLocked = await countFailedAttempt(
        "User is temporary locked due to multiple failed login attempts. Try again later. You can also reset your password now to proceed."
      );
      if (!isLocked) setIsLoading(false);
      return;
    }

    try {
      await waitForMinimumAuthVerificationLoading(verificationStartedAt);
      await finalizeAfterMfaVerification(sessionToken, method, showRecoveryCodeInput);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendMfaCode = async () => {
    if (preview) return;
    try {
      setIsLoadingResend(true);
      await sendMfaToken.mutateAsync({ email });
      setResendDelayEnd(Date.now() + CLIENT_RESEND_DELAY_SECONDS * 1000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingResend(false);
    }
  };

  const handleWebAuthnVerification = async () => {
    if (preview) return;
    const verificationStartedAt = Date.now();
    setIsLoading(true);
    const mfaToken = getMfaTempToken();

    let sessionToken: string;
    try {
      SecurityClient.setMfaToken("");
      const options = await generateWebAuthnAuthenticationOptions();
      const authenticationResponse = await startAuthentication({ optionsJSON: options });
      const result = await verifyWebAuthnAuthentication({ authenticationResponse });
      if (!result.sessionToken) {
        setIsLoading(false);
        return;
      }
      SecurityClient.setMfaToken(mfaToken);
      const mfaResult = await verifyMfaToken({
        email,
        mfaCode: result.sessionToken,
        mfaMethod: MfaMethod.WEBAUTHN
      });
      sessionToken = mfaResult.token;
    } catch (error: any) {
      console.error("WebAuthn verification failed:", error);
      let errorMessage = "Failed to verify passkey";
      if (error.name === "NotAllowedError") {
        errorMessage = "Passkey verification was cancelled or timed out";
      } else if (error.message) {
        errorMessage = error.message;
      }
      SecurityClient.setMfaToken(mfaToken);
      toast.error(errorMessage);
      const isLocked = await countFailedAttempt(
        "User is temporary locked due to multiple failed login attempts. Try again later."
      );
      if (!isLocked) setIsLoading(false);
      return;
    }

    try {
      await waitForMinimumAuthVerificationLoading(verificationStartedAt);
      await finalizeAfterMfaVerification(sessionToken, MfaMethod.WEBAUTHN, false);
    } finally {
      setIsLoading(false);
    }
  };

  if (newRecoveryCodes) {
    return (
      <RecoveryCodes
        recoveryCodes={newRecoveryCodes}
        isPending={isLoading}
        onContinue={async () => {
          if (preview) return;
          setIsLoading(true);
          try {
            await completeLogin();
          } finally {
            setIsLoading(false);
          }
        }}
      />
    );
  }

  if (shouldShowTotpRegistration || shouldShowWebAuthnRegistration) {
    return (
      <MfaEnrollment
        method={method}
        onComplete={async () => {
          setShouldShowTotpRegistration(false);
          setShouldShowWebAuthnRegistration(false);
          await successCallback();
        }}
        onUseRecoveryCode={switchToRecoveryCode}
      />
    );
  }

  let title = "Two-factor authentication";
  let description: React.ReactNode;
  if (showRecoveryCodeInput) {
    description = "Enter one of your backup recovery codes.";
  } else if (method === MfaMethod.EMAIL) {
    title = "Check your email";
    description = (
      <>
        Enter the code we sent to <span className={styles.recipient}>{email}</span>
      </>
    );
  } else if (method === MfaMethod.TOTP) {
    description = "Enter the verification code from your authenticator app.";
  } else if (method === MfaMethod.WEBAUTHN) {
    title = "Passkey authentication";
    description = "Use your registered passkey to continue.";
  }

  let resendLabel = "Resend code";
  if (isLoadingResend) resendLabel = "Resending";
  else if (remainingResendSeconds > 0) resendLabel = `Resend code in ${remainingResendSeconds}s`;

  const recoveryActions = (
    <Stack gap={8}>
      <Inline justify="between">
        {!showRecoveryCodeInput && method === MfaMethod.EMAIL ? (
          <Button
            type="button"
            variant="link"
            disabled={isLoadingResend || remainingResendSeconds > 0}
            onClick={handleResendMfaCode}
          >
            {resendLabel}
          </Button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setMfaCode("");
            if (isRecoveringFromSetup) {
              SecurityClient.setMfaToken("");
              setShowRecoveryCodeInput(false);
              setIsRecoveringFromSetup(false);
              showFactorSetup();
              return;
            }
            setShowRecoveryCodeInput(!showRecoveryCodeInput);
          }}
        >
          {recoveryToggleLabel}
        </Button>
      </Inline>
      {showRecoveryCodeInput && (
        <Text muted>
          {isInfisicalCloud()
            ? "Lost your recovery codes? Contact support@infisical.com with proof of account ownership to start account recovery."
            : "Lost your recovery codes? Contact your instance administrator with proof of account ownership to start account recovery."}
        </Text>
      )}
    </Stack>
  );

  return (
    <AuthPage
      pageTitle="Two-Factor Authentication"
      title={title}
      description={description}
      titleAction={
        onChangeAccount ? (
          <Button
            type="button"
            variant="link"
            aria-label={`Sign out ${email}`}
            onClick={onChangeAccount}
          >
            Sign out
          </Button>
        ) : undefined
      }
    >
      {method === MfaMethod.WEBAUTHN && !showRecoveryCodeInput ? (
        <Stack gap={16}>
          {typeof triesLeft === "number" && (
            <Alert tone="bad" title="Failed authentication">
              You have {triesLeft} attempt(s) remaining.
            </Alert>
          )}
          <Button
            type="button"
            variant="accent"
            size="lg"
            className="w-full"
            loading={isLoading}
            disabledReason={isLockedOut ? "Too many failed attempts" : undefined}
            onClick={handleWebAuthnVerification}
          >
            Authenticate with passkey
          </Button>
          {recoveryActions}
        </Stack>
      ) : (
        <CodeForm
          key={showRecoveryCodeInput ? "recovery" : method}
          label={showRecoveryCodeInput ? "Recovery code" : "Verification code"}
          length={expectedCodeLength}
          value={mfaCode}
          onChange={setMfaCode}
          onSubmit={verifyMfa}
          isPending={isLoading}
          isDisabled={isLockedOut}
          error={
            typeof triesLeft === "number"
              ? `Invalid code. You have ${triesLeft} attempt(s) remaining.`
              : undefined
          }
        >
          {recoveryActions}
        </CodeForm>
      )}
    </AuthPage>
  );
};
