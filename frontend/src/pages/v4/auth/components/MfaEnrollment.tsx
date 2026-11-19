import { useEffect, useRef, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Stack } from "@infisical/cipher/ui/layout";

import { MFA_METHOD_ICONS, MFA_METHOD_LABELS } from "@app/components/mfa/setup/types";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { getMfaTempToken } from "@app/hooks/api/reactQuery";

import { AuthPage } from "./AuthPage";
import { TotpVerify, WebAuthnVerify } from "./MfaMethodSetup";

import styles from "../auth.module.css";

type Props = {
  methods: MfaMethod[];
  onComplete: () => void | Promise<void>;
  onUseRecoveryCode?: () => void;
};

export const MfaEnrollment = ({ methods, onComplete, onUseRecoveryCode }: Props) => {
  const hasPrepared = useRef(false);
  const [selectedMethod, setSelectedMethod] = useState<MfaMethod | null>(
    methods.length === 1 ? methods[0] : null
  );

  useEffect(() => {
    if (hasPrepared.current) return;
    hasPrepared.current = true;
    SecurityClient.setMfaToken("");
  }, []);

  const handleVerified = async () => {
    SecurityClient.setMfaToken(getMfaTempToken());
    await onComplete();
  };

  let description = "Set up one of the methods your organization allows to sign in.";
  if (selectedMethod && methods.length === 1) {
    description = `Your organization requires ${MFA_METHOD_LABELS[selectedMethod].toLowerCase()} to sign in.`;
  } else if (selectedMethod) {
    description = `Set up ${MFA_METHOD_LABELS[selectedMethod].toLowerCase()} to sign in.`;
  }

  return (
    <AuthPage
      variant="focused"
      pageTitle="Two-Factor Authentication"
      title="Set up two-factor authentication"
      description={description}
      footer={
        onUseRecoveryCode ? (
          <span>
            Can&apos;t finish setup?{" "}
            <button type="button" className={styles.link} onClick={onUseRecoveryCode}>
              Use a recovery code
            </button>
          </span>
        ) : undefined
      }
    >
      {selectedMethod ? (
        <Stack gap={16}>
          {selectedMethod === MfaMethod.TOTP ? (
            <TotpVerify onVerified={handleVerified} />
          ) : (
            <WebAuthnVerify onVerified={handleVerified} />
          )}
          {methods.length > 1 && (
            <Button
              type="button"
              variant="link"
              className="self-center"
              onClick={() => setSelectedMethod(null)}
            >
              Choose a different method
            </Button>
          )}
        </Stack>
      ) : (
        <Stack gap={8}>
          {methods.map((method) => (
            <Button
              key={method}
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              icon={MFA_METHOD_ICONS[method]}
              onClick={() => setSelectedMethod(method)}
            >
              {MFA_METHOD_LABELS[method]}
            </Button>
          ))}
        </Stack>
      )}
    </AuthPage>
  );
};
