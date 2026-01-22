import { FormEvent, useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "@tanstack/react-router";

import { Button, EmailServiceSetupModal, Input } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { useSendAccountRecoveryEmail } from "@app/hooks/api/account-recovery";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

export const AccountRecoveryPage = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState(1);
  const { data: serverDetails } = useFetchServerStatus();
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["setUpEmail"] as const);

  const { mutateAsync } = useSendAccountRecoveryEmail();

  /**
   * This function sends the recovery email and forwards a user to the next step.
   */
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
    <div className="flex min-h-screen flex-col justify-center bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6 pb-28">
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
      <Link to="/">
        <div className="mt-20 mb-4 flex justify-center">
          <img
            src="/images/gradientLogo.svg"
            style={{
              height: "90px",
              width: "120px"
            }}
            alt="Infisical Logo"
          />
        </div>
      </Link>
      {step === 1 && (
        <form
          onSubmit={onSubmit}
          className="mx-auto flex w-full flex-col items-center justify-center"
        >
          <h1 className="mb-2 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
            Forgot your password?
          </h1>
          <p className="w-max justify-center text-center text-sm text-gray-400">
            Enter your email to start the password reset process. <br /> You will receive an email
            with instructions.
          </p>
          <div className="mt-8 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Enter your email..."
              isRequired
              autoComplete="username"
              className="h-10"
            />
          </div>
          <div className="mt-4 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
            <Button
              type="submit"
              size="sm"
              isFullWidth
              className="h-10"
              colorSchema="primary"
              variant="solid"
              isLoading={loading}
            >
              Continue
            </Button>
          </div>
          <div className="mt-6 flex flex-row text-sm text-bunker-400">
            <Link to="/login">
              <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
                Back to Login
              </span>
            </Link>
          </div>
        </form>
      )}
      {step === 2 && (
        <div className="mx-auto flex w-full flex-col items-center justify-center">
          <h1 className="mb-2 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
            Look for an email in your inbox
          </h1>
          <p className="w-max max-w-lg justify-center text-center text-sm text-gray-400">
            If the email is in our system, you will receive an email at{" "}
            <span className="italic">{email}</span> with instructions on how to reset your password.
          </p>
          <div className="mt-6 flex flex-row text-sm text-bunker-400">
            <Link to="/login">
              <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
                Back to Login
              </span>
            </Link>
          </div>
        </div>
      )}
      <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
      />
    </div>
  );
};
