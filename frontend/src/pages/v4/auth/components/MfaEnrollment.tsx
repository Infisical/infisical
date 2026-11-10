import { useEffect, useRef } from "react";

import { MFA_METHOD_LABELS } from "@app/components/mfa/setup/types";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { getMfaTempToken } from "@app/hooks/api/reactQuery";

import { AuthPage } from "./AuthPage";
import { TotpVerify, WebAuthnVerify } from "./MfaMethodSetup";

import styles from "../auth.module.css";

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
