import { FormEvent, useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";

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
    <AuthPageLayout variant="focused">
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
              <CardHeader className="mb-6 gap-2">
                <CardTitle className="font-alliance text-2xl font-normal">
                  Recover your account
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-label">
                  Enter your email to receive recovery instructions.
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
                <Link
                  to="/login"
                  className="self-center text-sm text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project"
                >
                  Back to login
                </Link>
              </CardContent>
            </AuthPagePanel>
          </form>
        )}
        {step === 2 && (
          <AuthPagePanel className="text-center">
            <CardHeader className="mb-6 items-center gap-2 text-center">
              <div
                aria-hidden="true"
                className="mb-4 flex size-12 items-center justify-center justify-self-center rounded-lg bg-card text-foreground/80"
              >
                <MailCheck className="size-5" strokeWidth={1.75} />
              </div>
              <CardTitle className="justify-center text-center font-alliance text-2xl font-normal">
                Check your inbox
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <p className="text-sm text-label">
                If an account exists for{" "}
                <span className="font-medium text-foreground">{email}</span>, you&apos;ll receive
                recovery instructions shortly.
              </p>
              <Link
                to="/login"
                className="self-center text-sm text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project"
              >
                Back to login
              </Link>
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
