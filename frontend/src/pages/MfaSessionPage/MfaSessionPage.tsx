import { ReactNode, useEffect } from "react";
import { useParams } from "@tanstack/react-router";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import {
  MFA_CHALLENGE_PROMPTS,
  MfaSessionChallenge
} from "@app/components/mfa/MfaSessionChallenge";
import { createNotification } from "@app/components/notifications";
import { CardContent, VerificationCodeHeader } from "@app/components/v3";
import { stashMfaLockoutError } from "@app/helpers/mfaSession";
import { MfaSessionStatus, useMfaSessionStatus } from "@app/hooks/api/mfaSession";

const MfaAuthPage = ({ children }: { children: ReactNode }) => (
  <AuthPageLayout variant="focused" showFooter={false}>
    <AuthPagePanel>{children}</AuthPagePanel>
  </AuthPageLayout>
);

const notifyAndClose = () => {
  createNotification({
    text: "MFA verification successful! Closing window...",
    type: "success"
  });

  setTimeout(() => {
    window.close();
  }, 1000);
};

export const MfaSessionPage = () => {
  const { mfaSessionId } = useParams({ strict: false }) as { mfaSessionId: string };

  const { data: sessionStatus, isError: isStatusError } = useMfaSessionStatus(mfaSessionId);

  useEffect(() => {
    if (sessionStatus?.status === MfaSessionStatus.ACTIVE) {
      notifyAndClose();
    }
  }, [sessionStatus?.status]);

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
        description={MFA_CHALLENGE_PROMPTS[sessionStatus.mfaMethod]}
      />

      <CardContent className="flex flex-col gap-5">
        <MfaSessionChallenge
          mfaSessionId={mfaSessionId}
          mfaMethod={sessionStatus.mfaMethod}
          onVerified={notifyAndClose}
          onLockout={(message) => {
            stashMfaLockoutError(mfaSessionId, message);
            window.close();
          }}
        />
      </CardContent>
    </MfaAuthPage>
  );
};
