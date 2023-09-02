import { FormEvent, useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";

import Button from "@app/components/basic/buttons/Button";
import InputField from "@app/components/basic/InputField";
import { EmailServiceSetupModal } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { useSendPasswordResetEmail } from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

export default function VerifyEmail() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState(1);
  const { data: serverDetails } = useFetchServerStatus();
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["setUpEmail"] as const);

  const { mutateAsync } = useSendPasswordResetEmail();

  /**
   * This function sends the verification email and forwards a user to the next step.
   */
  const sendVerificationEmail = async () => {
    if (email) {
      await mutateAsync({ email });
      setStep(2);
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    if (serverDetails?.emailConfigured) {
      sendVerificationEmail();
    } else {
      handlePopUpOpen("setUpEmail");
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col justify-start bg-bunker-800 px-6">
      <Head>
        <title>Login</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Verify your email in Infisical" />
        <meta
          name="og:description"
          content="Infisical a simple end-to-end encrypted platform that enables teams to sync and manage their .env files."
        />
      </Head>
      <Link href="/">
        <div className="mb-8 mt-20 flex cursor-pointer justify-center">
          <Image src="/images/biglogo.png" height={90} width={120} alt="long logo" />
        </div>
      </Link>
      {step === 1 && (
        <form
          onSubmit={onSubmit}
          className="h-7/12 mx-auto w-full max-w-md rounded-xl bg-bunker px-6 py-4 pt-8 drop-shadow-xl"
        >
          <p className="mx-auto mb-6 flex w-max justify-center text-2xl font-semibold text-bunker-100 md:text-3xl">
            Forgot your password?
          </p>
          <div className="mt-4 flex flex-row items-center justify-center md:mx-2 md:pb-4">
            <p className="flex w-max justify-center text-sm text-gray-400">
              You will need your emergency kit. Enter your email to start account recovery.
            </p>
          </div>
          <div className="mt-4 flex max-h-24 w-full items-center justify-center rounded-lg md:mt-0 md:max-h-28 md:p-2">
            <InputField
              label="Email"
              onChangeHandler={setEmail}
              type="email"
              value={email}
              placeholder=""
              isRequired
              autoComplete="username"
            />
          </div>
          <div className="mx-auto mt-4 flex max-h-20 w-full max-w-md flex-col items-center justify-center text-sm md:p-2">
            <div className="text-l m-8 mt-6 px-8 py-3 text-lg">
              <Button
                type="submit"
                text="Continue"
                size="lg"
                onButtonPressed={() => {}}
                loading={loading}
              />
            </div>
          </div>
        </form>
      )}
      {step === 2 && (
        <div className="h-7/12 mx-auto w-full max-w-md rounded-xl bg-bunker py-4 px-6 pt-8 drop-shadow-xl">
          <p className="mx-auto mb-6 flex w-max justify-center text-xl font-semibold text-bunker-100 md:text-2xl">
            Look for an email in your inbox.
          </p>
          <div className="mt-4 flex flex-row items-center justify-center md:mx-2 md:pb-4">
            <p className="flex w-max justify-center text-center text-sm text-gray-400">
              An email with instructions has been sent to {email}.
            </p>
          </div>
        </div>
      )}

      <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
      />
    </div>
  );
}
