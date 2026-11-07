import { useEffect } from "react";
import { useParams } from "@tanstack/react-router";

import { Loader } from "@app/components/v4/ui/loader";
import { Toaster, toast } from "@app/components/v4/ui/sonner";
import { stashMfaLockoutError } from "@app/helpers/mfaSession";
import { MfaSessionStatus, useMfaSessionStatus } from "@app/hooks/api/mfaSession";

import { AuthPage } from "../components/AuthPage";
import { MFA_CHALLENGE_PROMPTS, MfaSessionChallenge } from "../components/MfaSessionChallenge";

const notifyAndClose = () => {
  toast.success("MFA verification successful! Closing window...");
  setTimeout(() => window.close(), 1000);
};

const Page = ({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) => (
  <>
    <AuthPage pageTitle="Two-Factor Authentication" title={title} description={description}>
      {children}
    </AuthPage>
    <Toaster />
  </>
);

export const MfaSessionPage = () => {
  const { mfaSessionId } = useParams({ from: "/v4/mfa-session/$mfaSessionId" });
  const { data: sessionStatus, isError } = useMfaSessionStatus(mfaSessionId);

  useEffect(() => {
    if (sessionStatus?.status === MfaSessionStatus.ACTIVE) notifyAndClose();
  }, [sessionStatus?.status]);

  if (isError) {
    return (
      <Page
        title="Session expired"
        description="This MFA session has expired or is invalid. Try your action again."
      />
    );
  }

  if (!sessionStatus) return <Loader size="page" label="Loading verification" className="flex-1" />;

  if (sessionStatus.status === MfaSessionStatus.ACTIVE) {
    return <Page title="Verification complete" description="This window closes automatically." />;
  }

  return (
    <Page
      title="Two-factor authentication"
      description={MFA_CHALLENGE_PROMPTS[sessionStatus.mfaMethod]}
    >
      <MfaSessionChallenge
        mfaSessionId={mfaSessionId}
        mfaMethod={sessionStatus.mfaMethod}
        onVerified={notifyAndClose}
        onLockout={(message) => {
          stashMfaLockoutError(mfaSessionId, message);
          window.close();
        }}
      />
    </Page>
  );
};
