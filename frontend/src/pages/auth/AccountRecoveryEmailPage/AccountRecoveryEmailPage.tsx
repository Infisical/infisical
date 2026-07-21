import { FormEvent, useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "@tanstack/react-router";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { EmailServiceSetupModal } from "@app/components/v2";
import { Button, CardContent, CardHeader, CardTitle, Input } from "@app/components/v3";
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
    <AuthPageLayout
      headerAction={
        <Button asChild>
          <Link to="/login">Log In</Link>
        </Button>
      }
    >
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
      <div className="flex flex-col items-center">
        {step === 1 && (
          <form onSubmit={onSubmit} className="w-full">
            <AuthPagePanel>
              <CardHeader className="mb-4 gap-4">
                <CardTitle className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.35rem] font-medium text-transparent">
                  Recover your account
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-label">
                  Enter your email to start the recovery process. You will receive an email with
                  instructions.
                </p>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="Enter your email..."
                  required
                  autoComplete="username"
                  className="h-10"
                />
                <Button type="submit" variant="project" size="lg" isFullWidth isPending={loading}>
                  Continue
                </Button>
                <div className="flex flex-row justify-center text-xs text-label">
                  <Link to="/login">
                    <span className="cursor-pointer duration-200 hover:text-foreground hover:underline hover:decoration-project/45 hover:underline-offset-2">
                      Back to Login
                    </span>
                  </Link>
                </div>
              </CardContent>
            </AuthPagePanel>
          </form>
        )}
        {step === 2 && (
          <AuthPagePanel>
            <CardHeader className="mb-4 gap-4">
              <CardTitle className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.35rem] font-medium text-transparent">
                Check your inbox
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-center text-sm text-foreground">
                If the email is in our system, you will receive an email at{" "}
                <span className="italic">{email}</span> to initiate the account recovery process.
              </p>
              <div className="flex flex-row justify-center text-xs text-label">
                <Link to="/login">
                  <span className="cursor-pointer duration-200 hover:text-foreground hover:underline hover:decoration-project/45 hover:underline-offset-2">
                    Back to Login
                  </span>
                </Link>
              </div>
            </CardContent>
          </AuthPagePanel>
        )}
      </div>
      <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
      />
    </AuthPageLayout>
  );
};
