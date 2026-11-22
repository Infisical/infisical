import { useEffect, useRef, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useNavigate } from "@tanstack/react-router";
import axios from "axios";
import { t } from "i18next";
import { ChevronDownIcon, ChevronUpIcon, CircleXIcon } from "lucide-react";

import { MfaEnrollment } from "@app/components/mfa/MfaEnrollment";
import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  Alert,
  AlertDescription,
  AnimatedCollapse,
  Button,
  CardContent,
  FieldSeparator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useClientResendDelay,
  VerificationCodeForm,
  VerificationCodeHeader,
  VerificationCodeResend
} from "@app/components/v3";
import { hasErrorName } from "@app/helpers/errors";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useActivateMfa, useLogoutUser, useSendMfaToken } from "@app/hooks/api";
import { getMfaMethods, verifyMfaToken, verifyRecoveryCode } from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { getMfaTempToken } from "@app/hooks/api/reactQuery";
import { fetchUserDetails } from "@app/hooks/api/users/queries";
import { useGenerateAuthenticationOptions, useVerifyAuthentication } from "@app/hooks/api/webauthn";

import { MFA_METHOD_ICONS, MFA_METHOD_LABELS, RecoveryCodesStep } from "../mfa/setup";
import { AuthPageLayout } from "./AuthPageLayout";
import { AuthPagePanel } from "./AuthPagePanel";
import { waitForMinimumAuthVerificationLoading } from "./authTiming";

const MAX_MFA_ATTEMPTS = 5;
const CLIENT_RESEND_DELAY_SECONDS = 20;

// The MFA token is a short-lived JWT; once it lapses the backend rejects every call made with it.
const isMfaTokenExpiredError = (error: unknown) =>
  axios.isAxiosError(error) &&
  error.response?.status === 403 &&
  error.response?.data?.error === "TokenError";

type Props = {
  // needsFactorSetup: the user got in with a recovery code instead of setting up the
  // method their org requires. The caller picks where they go, e.g. a CLI login must
  // still finish its token handoff first.
  successCallback: (options?: { needsFactorSetup?: boolean }) => void | Promise<void>;
  closeMfa?: () => void;
  email: string;
  method: MfaMethod;
  onChangeAccount?: () => void | Promise<void>;
  // Starts a fresh challenge when the MFA token expires; without it the challenge is closed.
  onSessionExpired?: () => void | Promise<void>;
};

export const Mfa = ({
  successCallback,
  closeMfa,
  email,
  method,
  onChangeAccount,
  onSessionExpired
}: Props) => {
  const [mfaCode, setMfaCode] = useState("");
  const [showRecoveryCodeInput, setShowRecoveryCodeInput] = useState(false);
  const [activeMethod, setActiveMethod] = useState<MfaMethod>(method);
  const [usableMethods, setUsableMethods] = useState<MfaMethod[]>([method]);
  const [enrollableMethods, setEnrollableMethods] = useState<MfaMethod[]>([]);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  // The backend emails a code only when email is the starting method, so switching to it later sends one.
  const hasSentEmailCodeRef = useRef(method === MfaMethod.EMAIL);
  const resendEmailDelay = useClientResendDelay(CLIENT_RESEND_DELAY_SECONDS);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingResend, setIsLoadingResend] = useState(false);
  const [triesLeft, setTriesLeft] = useState<number | undefined>(undefined);
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);
  const [hasSavedRecoveryCodes, setHasSavedRecoveryCodes] = useState(false);
  const wasMfaEnabledRef = useRef(true);
  // Recovery codes exist only while 2FA is on; unknown counts as yes so setup never hides a working way in.
  const [hasRecoveryCodes, setHasRecoveryCodes] = useState(true);
  // Factor setup clears the MFA token so its calls run on the access token; a recovery-code
  // login out of setup needs it back.
  const mfaTokenRef = useRef(getMfaTempToken());
  const [isRecoveringFromSetup, setIsRecoveringFromSetup] = useState(false);
  const { mutateAsync: activateMfa } = useActivateMfa();
  const logout = useLogoutUser();

  const { mutateAsync: generateWebAuthnAuthenticationOptions } = useGenerateAuthenticationOptions();
  const { mutateAsync: verifyWebAuthnAuthentication } = useVerifyAuthentication();

  const sendMfaToken = useSendMfaToken();

  const loadMethods = async () => {
    try {
      const methods = await getMfaMethods();
      setUsableMethods(methods.usableMethods);
      setEnrollableMethods(methods.enrollableMethods);
      if (methods.usableMethods.length) {
        setActiveMethod(methods.challengeMethod);
        return;
      }
      if (methods.enrollableMethods.length) setShowEnrollment(true);
    } catch {
      // Keep the method select-organization returned; the user can still verify it or use a recovery code.
    }
  };

  useEffect(() => {
    fetchUserDetails()
      .then((user) => {
        wasMfaEnabledRef.current = Boolean(user.isMfaEnabled);
        setHasRecoveryCodes(Boolean(user.isMfaEnabled));
      })
      .catch(() => {
        // Keep the safe default (treat as enabled) so existing codes are never rotated.
      });

    setActiveMethod(method);
    hasSentEmailCodeRef.current = method === MfaMethod.EMAIL;
    loadMethods();
  }, [method]);

  const handleMfaTokenExpired = async () => {
    SecurityClient.setMfaToken("");
    if (onSessionExpired) {
      await onSessionExpired();
      return;
    }
    createNotification({
      text: "Your verification session expired. Try again to get a new code.",
      type: "info"
    });
    closeMfa?.();
  };

  const getExpectedCodeLength = () => {
    // Recovery codes are account-level and 8 characters for every MFA method
    // (email, TOTP and passkeys).
    if (showRecoveryCodeInput) return 8;
    return 6;
  };

  const isCodeComplete = mfaCode.length === getExpectedCodeLength();

  const showFactorSetup = () => {
    setShowEnrollment(true);
  };

  const switchToRecoveryCode = () => {
    SecurityClient.setMfaToken(mfaTokenRef.current);
    setShowEnrollment(false);
    setShowRecoveryCodeInput(true);
    setIsRecoveringFromSetup(true);
  };

  const getRecoveryToggleLabel = () => {
    if (isRecoveringFromSetup) return "Back to setup";
    if (!showRecoveryCodeInput) return "Use a recovery code";
    if (activeMethod === MfaMethod.WEBAUTHN) return "Use passkey instead";
    if (activeMethod === MfaMethod.EMAIL) return "Use email code";
    return "Use authenticator code";
  };

  const completeLogin = async () => {
    await successCallback({ needsFactorSetup: isRecoveringFromSetup });
    if (closeMfa) {
      closeMfa();
    }
    if (isRecoveringFromSetup) {
      const requiredLabels = (enrollableMethods.length ? enrollableMethods : [activeMethod])
        .map((requiredMethod) => MFA_METHOD_LABELS[requiredMethod].toLowerCase())
        .join(" or ");
      createNotification({
        text: `Set up your ${requiredLabels} in Personal Settings. Your organization requires it to sign in.`,
        type: "info"
      });
    }
  };

  // Runs only after MFA verification has already succeeded: the MFA token is consumed
  // and a real session token is issued. Enabling MFA + minting recovery codes is a
  // distinct follow-up step and must NOT share the verification's error handling — if
  // it fails, the user's code was still accepted, so bouncing them back to the code
  // entry (where resubmitting a consumed code can never work) or decrementing the retry
  // counter would trap them. On failure we surface a dedicated message and let them
  // proceed; recovery codes can be generated later from account security settings.
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
        createNotification({
          text: "Your identity was verified, but two-factor setup couldn't be completed. You can set up recovery codes later from your account security settings.",
          type: "error"
        });
      }
    }

    await completeLogin();
  };

  const verifyMfa = async () => {
    if (!mfaCode.trim() || !isCodeComplete) return;

    const verificationStartedAt = Date.now();
    setIsLoading(true);

    let sessionToken: string;
    try {
      const result = showRecoveryCodeInput
        ? await verifyRecoveryCode(mfaCode.trim())
        : await verifyMfaToken({
            email,
            mfaCode: mfaCode.trim(),
            mfaMethod: activeMethod
          });
      sessionToken = result.token;
    } catch (error) {
      if (isMfaTokenExpiredError(error)) {
        setIsLoading(false);
        await handleMfaTokenExpired();
        return;
      }
      if (typeof triesLeft === "number") {
        const newTriesLeft = triesLeft - 1;
        setTriesLeft(newTriesLeft);
        if (newTriesLeft <= 0) {
          createNotification({
            text: "User is temporary locked due to multiple failed login attempts. Try again later. You can also reset your password now to proceed.",
            type: "error"
          });
          SecurityClient.setMfaToken("");
          SecurityClient.setToken("");
          SecurityClient.setSignupToken("");
          await logout.mutateAsync();
          navigate({ to: "/login" });
          return;
        }
      } else {
        setTriesLeft(MAX_MFA_ATTEMPTS - 1);
      }
      setIsLoading(false);
      return;
    }

    try {
      await waitForMinimumAuthVerificationLoading(verificationStartedAt);
      await finalizeAfterMfaVerification(sessionToken, activeMethod, showRecoveryCodeInput);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendMfaCode = async () => {
    try {
      setIsLoadingResend(true);
      await sendMfaToken.mutateAsync({ email });
      resendEmailDelay.restartDelay();
      setIsLoadingResend(false);
    } catch (err) {
      setIsLoadingResend(false);
      if (isMfaTokenExpiredError(err)) {
        await handleMfaTokenExpired();
        return;
      }
      console.error(err);
    }
  };

  const switchMethod = async (nextMethod: MfaMethod) => {
    setMfaCode("");
    setShowRecoveryCodeInput(false);
    setShowMoreOptions(false);
    setActiveMethod(nextMethod);
    if (nextMethod === MfaMethod.EMAIL && !hasSentEmailCodeRef.current) {
      hasSentEmailCodeRef.current = true;
      await handleResendMfaCode();
    }
  };

  const handleWebAuthnVerification = async () => {
    const verificationStartedAt = Date.now();
    setIsLoading(true);
    const mfaToken = getMfaTempToken();

    let sessionToken: string;
    try {
      SecurityClient.setMfaToken("");

      // Get authentication options from server
      const options = await generateWebAuthnAuthenticationOptions();

      // Prompt user to authenticate with their passkey
      const authenticationResponse = await startAuthentication({ optionsJSON: options });

      // Verify with server
      const result = await verifyWebAuthnAuthentication({ authenticationResponse });

      // Nothing to verify against without a session token; bail out without counting
      // this as a failed attempt.
      if (!result.sessionToken) {
        setIsLoading(false);
        return;
      }

      // Use the sessionToken to verify MFA
      SecurityClient.setMfaToken(mfaToken);
      const mfaResult = await verifyMfaToken({
        email,
        mfaCode: result.sessionToken,
        mfaMethod: MfaMethod.WEBAUTHN
      });
      sessionToken = mfaResult.token;
    } catch (error) {
      if (isMfaTokenExpiredError(error)) {
        setIsLoading(false);
        await handleMfaTokenExpired();
        return;
      }

      console.error("WebAuthn verification failed:", error);

      let errorMessage = "Failed to verify passkey";
      if (hasErrorName(error, "NotAllowedError")) {
        errorMessage = "Passkey verification was cancelled or timed out";
      } else if (error instanceof Error && error.message) {
        errorMessage = error.message;
      }

      SecurityClient.setMfaToken(mfaToken);

      createNotification({
        text: errorMessage,
        type: "error"
      });

      if (typeof triesLeft === "number") {
        const newTriesLeft = triesLeft - 1;
        setTriesLeft(newTriesLeft);
        if (newTriesLeft <= 0) {
          createNotification({
            text: "User is temporary locked due to multiple failed login attempts. Try again later.",
            type: "error"
          });
          SecurityClient.setMfaToken("");
          SecurityClient.setToken("");
          SecurityClient.setSignupToken("");
          await logout.mutateAsync();
          navigate({ to: "/login" });
          return;
        }
      } else {
        setTriesLeft(MAX_MFA_ATTEMPTS - 1);
      }
      setIsLoading(false);
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
      <AuthPageLayout variant="focused" showFooter={false}>
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <RecoveryCodesStep
            recoveryCodes={newRecoveryCodes}
            acknowledgment={{
              isAcknowledged: hasSavedRecoveryCodes,
              onAcknowledgedChange: setHasSavedRecoveryCodes,
              confirmLabel: "Continue",
              isConfirmPending: isLoading,
              labelClassName: "text-foreground-soft",
              onConfirm: async () => {
                setIsLoading(true);
                try {
                  await completeLogin();
                } finally {
                  setIsLoading(false);
                }
              }
            }}
          />
        </div>
      </AuthPageLayout>
    );
  }

  if (showEnrollment) {
    return (
      <AuthPageLayout variant="focused" showFooter={false} contentClassName="max-w-xl">
        <MfaEnrollment
          methods={enrollableMethods.length ? enrollableMethods : [activeMethod]}
          onComplete={async () => {
            setShowEnrollment(false);
            await successCallback();
            await loadMethods();
          }}
          onUseRecoveryCode={hasRecoveryCodes ? switchToRecoveryCode : undefined}
        />
      </AuthPageLayout>
    );
  }

  let headerTitle = "Two-factor authentication";
  let headerDescription: string | undefined;
  let headerRecipient: string | undefined;

  if (showRecoveryCodeInput) {
    headerDescription = "Enter one of your backup recovery codes.";
  } else if (activeMethod === MfaMethod.EMAIL) {
    headerTitle = String(t("mfa.step2-message"));
    headerRecipient = email;
  } else if (activeMethod === MfaMethod.TOTP) {
    headerDescription = "Enter the verification code from your authenticator app.";
  } else if (activeMethod === MfaMethod.WEBAUTHN) {
    headerTitle = "Passkey authentication";
    headerDescription = "Use your registered passkey to continue.";
  }

  const linkClassName =
    "cursor-pointer text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project";
  const otherMethods = usableMethods.filter((usableMethod) => usableMethod !== activeMethod);
  const hasMoreOptions =
    otherMethods.length > 0 && !showRecoveryCodeInput && !isRecoveringFromSetup;

  const MoreOptionsChevron = showMoreOptions ? ChevronUpIcon : ChevronDownIcon;
  const moreOptions = hasMoreOptions && (
    <div className="flex flex-col">
      <Button
        variant="outline"
        size="lg"
        isFullWidth
        aria-controls="mfa-more-options"
        aria-expanded={showMoreOptions}
        onClick={() => setShowMoreOptions(!showMoreOptions)}
      >
        More Options
        <MoreOptionsChevron />
      </Button>
      <AnimatedCollapse id="mfa-more-options" isOpen={showMoreOptions}>
        <div className="flex flex-col gap-2 pt-2">
          <FieldSeparator />
          {otherMethods.map((otherMethod) => {
            const Icon = MFA_METHOD_ICONS[otherMethod];
            return (
              <Button
                key={otherMethod}
                variant="outline"
                size="lg"
                isFullWidth
                onClick={() => switchMethod(otherMethod)}
              >
                <Icon />
                {MFA_METHOD_LABELS[otherMethod]}
              </Button>
            );
          })}
        </div>
      </AnimatedCollapse>
    </div>
  );

  const showRecoveryToggle = showRecoveryCodeInput || isRecoveringFromSetup || hasRecoveryCodes;
  const hasRecoveryActions = activeMethod === MfaMethod.EMAIL || showRecoveryToggle;
  const recoveryActions = hasRecoveryActions && (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {showRecoveryCodeInput ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-label transition-colors duration-200 hover:text-foreground">
              Lost your recovery codes?
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="max-w-xs text-center text-xs">
              {isInfisicalCloud() ? (
                <>
                  <div className="mb-2">Account Recovery Required</div>
                  <div className="mb-2 text-accent">
                    Contact support with valid proof of account ownership to initiate recovery
                  </div>
                  <div className="mt-1">support@infisical.com</div>
                </>
              ) : (
                <>
                  <div className="mb-2">Account Recovery Required</div>
                  <div className="text-accent">
                    Contact your instance administrator with valid proof of account ownership to
                    initiate recovery
                  </div>
                </>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      ) : (
        activeMethod === MfaMethod.EMAIL && (
          <VerificationCodeResend
            isResending={isLoadingResend}
            remainingSeconds={resendEmailDelay.remainingSeconds}
            onResend={handleResendMfaCode}
          />
        )
      )}
      {showRecoveryToggle && (
        <button
          type="button"
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
          className={`ml-auto ${linkClassName}`}
        >
          {getRecoveryToggleLabel()}
        </button>
      )}
    </div>
  );

  return (
    <AuthPageLayout variant="focused" showFooter={false}>
      <AuthPagePanel>
        <VerificationCodeHeader
          title={headerTitle}
          recipient={headerRecipient}
          description={headerDescription}
          action={
            onChangeAccount ? (
              <button
                aria-label={`Sign out ${email}`}
                className="shrink-0 cursor-pointer text-sm text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project"
                onClick={onChangeAccount}
                type="button"
              >
                Sign out
              </button>
            ) : undefined
          }
        />
        <CardContent>
          {activeMethod === MfaMethod.WEBAUTHN && !showRecoveryCodeInput ? (
            <div className="flex flex-col gap-5">
              {typeof triesLeft === "number" && (
                <Alert variant="danger">
                  <CircleXIcon />
                  <AlertDescription>
                    {`Failed authentication. You have ${triesLeft} attempt(s) remaining.`}
                  </AlertDescription>
                </Alert>
              )}
              <Button
                size="lg"
                onClick={handleWebAuthnVerification}
                isFullWidth
                variant="project"
                isPending={isLoading}
                isDisabled={typeof triesLeft === "number" && triesLeft <= 0}
              >
                Authenticate with passkey
              </Button>
              {recoveryActions}
              {moreOptions}
            </div>
          ) : (
            <VerificationCodeForm
              key={showRecoveryCodeInput ? "recovery" : activeMethod}
              name="mfa-code"
              fields={showRecoveryCodeInput ? 8 : 6}
              value={mfaCode}
              onChange={setMfaCode}
              onSubmit={verifyMfa}
              isPending={isLoading}
              isDisabled={typeof triesLeft === "number" && triesLeft <= 0}
              error={
                typeof triesLeft === "number"
                  ? `Invalid code. You have ${triesLeft} attempt(s) remaining.`
                  : undefined
              }
            >
              {recoveryActions}
              {moreOptions}
            </VerificationCodeForm>
          )}
        </CardContent>
      </AuthPagePanel>
    </AuthPageLayout>
  );
};
