import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, Input } from "@app/components/v2";

type Props = {
  setStep: (step: number) => void;
  type: "SAML" | "OIDC";
};

export const SSOStep = ({ setStep, type }: Props) => {
  const [ssoIdentifier, setSSOIdentifier] = useState("");
  const { t } = useTranslation();

  const queryParams = new URLSearchParams(window.location.search);

  const handleSubmission = (e: React.FormEvent) => {
    e.preventDefault();
    const callbackPort = queryParams.get("callback_port");
    if (type === "SAML") {
      window.open(
        `/api/v1/sso/redirect/saml2/organizations/${ssoIdentifier}${
          callbackPort ? `?callback_port=${callbackPort}` : ""
        }`
      );
    } else {
      window.open(
        `/api/v1/sso/oidc/login?orgSlug=${ssoIdentifier}${
          callbackPort ? `&callbackPort=${callbackPort}` : ""
        }`
      );
    }

    window.close();
  };

  return (
    <div className="mx-auto w-full max-w-md md:px-6">
      <p className="bg-linear-to-b to-bunker-200 mx-auto mb-8 flex w-max justify-center from-white bg-clip-text text-center text-xl font-medium text-transparent">
        What&apos;s your organization slug?
      </p>
      <form onSubmit={handleSubmission}>
        <div className="md:min-w-88 relative mx-auto flex max-h-24 w-full min-w-[20rem] items-center justify-center rounded-lg md:max-h-28 lg:w-1/6">
          <div className="flex max-h-24 w-full items-center justify-center rounded-lg md:max-h-28">
            <Input
              value={ssoIdentifier}
              onChange={(e) => setSSOIdentifier(e.target.value)}
              type="text"
              placeholder="acme-123"
              isRequired
              autoComplete="email"
              id="email"
              className="h-12"
            />
          </div>
        </div>
        <div className="md:min-w-88 mx-auto mt-4 flex w-full min-w-[20rem] items-center justify-center rounded-md text-center lg:w-1/6">
          <Button
            type="submit"
            colorSchema="primary"
            variant="outline_bg"
            isFullWidth
            className="h-14"
          >
            Continue with {type}
          </Button>
        </div>
      </form>
      <div className="mt-4 flex flex-row items-center justify-center">
        <button
          onClick={() => {
            setStep(0);
          }}
          type="button"
          className="text-bunker-300 hover:text-bunker-200 hover:decoration-primary-700 mt-2 cursor-pointer text-sm duration-200 hover:underline hover:underline-offset-4"
        >
          {t("login.other-option")}
        </button>
      </div>
    </div>
  );
};
