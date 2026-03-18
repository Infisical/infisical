import { FormEvent, useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "@tanstack/react-router";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { AuthPageFooter } from "@app/components/auth/AuthPageFooter";
import { EmailServiceSetupModal } from "@app/components/v2";
import {
  Button,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableInput
} from "@app/components/v3";
import { usePopUp } from "@app/hooks";
import { useSendAccountRecoveryEmail } from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

export const AccountRecoveryEmailPage = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState(1);
  const { data: serverDetails } = useFetchServerStatus();
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["setUpEmail"] as const);

  const { mutateAsync } = useSendAccountRecoveryEmail();

  const sendRecoveryEmail = async () => {
    if (email) {
      try {
        await mutateAsync({ email });
        setStep(2);
      } catch {
        setLoading(false);
      }
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    if (serverDetails?.emailConfigured) {
      sendRecoveryEmail();
    } else {
      handlePopUpOpen("setUpEmail");
      setLoading(false);
    }
  };

  return (
    <div className="relative flex max-h-screen min-h-screen flex-col overflow-y-auto bg-linear-to-tr from-card via-bunker-900 to-card px-6">
      <AuthPageBackground />
      <Helmet>
        <title>Account Recovery</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Account Recovery in Infisical" />
        <meta
          name="og:description"
          content="Infisical a simple end-to-end encrypted platform that enables teams to sync and manage their .env files."
        />
      </Helmet>
      <div className="relative z-10 my-auto flex flex-col items-center py-10">
        <Link to="/">
          <div className="mb-4 flex justify-center">
            <img
              src="/images/gradientLogo.svg"
              style={{ height: "90px", width: "120px" }}
              alt="Infisical Logo"
            />
          </div>
        </Link>
        {step === 1 && (
          <form onSubmit={onSubmit} className="mx-auto w-full max-w-sm">
            <UnstableCard className="w-full items-stretch gap-0 p-6">
              <UnstableCardHeader className="mb-4 gap-4">
                <UnstableCardTitle className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.35rem] font-medium text-transparent">
                  Recover your account
                </UnstableCardTitle>
              </UnstableCardHeader>
              <UnstableCardContent>
                <p className="mb-4 text-sm text-label">
                  Enter your email to start the recovery process. You will receive an email with
                  instructions.
                </p>
                <div className="w-full">
                  <UnstableInput
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="Enter your email..."
                    required
                    autoComplete="username"
                    className="h-10"
                  />
                </div>
                <div className="mt-4 w-full">
                  <Button type="submit" variant="project" size="lg" isFullWidth isPending={loading}>
                    Continue
                  </Button>
                </div>
                <div className="mt-6 flex flex-row justify-center text-xs text-label">
                  <Link to="/login">
                    <span className="cursor-pointer duration-200 hover:text-foreground hover:underline hover:decoration-project/45 hover:underline-offset-2">
                      Back to Login
                    </span>
                  </Link>
                </div>
              </UnstableCardContent>
            </UnstableCard>
          </form>
        )}
        {step === 2 && (
          <UnstableCard className="mx-auto w-full max-w-sm items-stretch gap-0 p-6">
            <UnstableCardHeader className="mb-4 gap-4">
              <UnstableCardTitle className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.35rem] font-medium text-transparent">
                Check your inbox
              </UnstableCardTitle>
            </UnstableCardHeader>
            <UnstableCardContent>
              <p className="text-center text-sm text-foreground">
                If the email is in our system, you will receive an email at{" "}
                <span className="italic">{email}</span> to initiate the account recovery process.
              </p>
              <div className="mt-6 flex flex-row justify-center text-xs text-label">
                <Link to="/login">
                  <span className="cursor-pointer duration-200 hover:text-foreground hover:underline hover:decoration-project/45 hover:underline-offset-2">
                    Back to Login
                  </span>
                </Link>
              </div>
            </UnstableCardContent>
          </UnstableCard>
        )}
      </div>
      <AuthPageFooter />
      <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
      />
    </div>
  );
};
