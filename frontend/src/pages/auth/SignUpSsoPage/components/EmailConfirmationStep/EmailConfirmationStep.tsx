// confirm email
// if same email exists, then trigger fn to merge automatically
import { useState } from "react";
import ReactCodeInput from "react-code-input";
import { useNavigate } from "@tanstack/react-router";

import Error from "@app/components/basic/Error";
import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v2";
import { useSendEmailVerificationCode, useVerifyEmailVerificationCode } from "@app/hooks/api";
import { UserAliasType } from "@app/hooks/api/users/types";

type Props = {
  authType?: UserAliasType;
  username: string;
  email: string;
  organizationSlug: string;
  setStep: (step: number) => void;
};

// The style for the verification code input
const props = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "55px",
    borderRadius: "5px",
    fontSize: "24px",
    height: "55px",
    paddingLeft: "7",
    backgroundColor: "#0d1117",
    color: "white",
    border: "1px solid #2d2f33",
    textAlign: "center",
    outlineColor: "#8ca542",
    borderColor: "#2d2f33"
  }
} as const;
const propsPhone = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "40px",
    borderRadius: "5px",
    fontSize: "24px",
    height: "40px",
    paddingLeft: "7",
    backgroundColor: "#0d1117",
    color: "white",
    border: "1px solid #2d2f33",
    textAlign: "center",
    outlineColor: "#8ca542",
    borderColor: "#2d2f33"
  }
} as const;

export const EmailConfirmationStep = ({
  authType,
  username,
  email,
  organizationSlug,
  setStep
}: Props) => {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [isResendingVerificationEmail] = useState(false);
  const [isLoading] = useState(false);

  const { mutateAsync: sendEmailVerificationCode } = useSendEmailVerificationCode();
  const { mutateAsync: verifyEmailVerificationCode } = useVerifyEmailVerificationCode();

  const checkCode = async () => {
    await verifyEmailVerificationCode({ username, code });
    setCodeError(false);

    createNotification({
      text: "Successfully verified code",
      type: "success"
    });

    switch (authType) {
      case UserAliasType.SAML: {
        window.open(`/api/v1/sso/redirect/saml2/organizations/${organizationSlug}`);
        window.close();
        break;
      }
      case UserAliasType.LDAP: {
        navigate({ to: "/login/ldap", search: { organizationSlug } });
        break;
      }
      case UserAliasType.OIDC: {
        window.open(`/api/v1/sso/oidc/login?orgSlug=${organizationSlug}`);
        window.close();
        break;
      }
      default: {
        setStep(1);
        break;
      }
    }

    setCode("");
  };

  const resendCode = async () => {
    const queryParams = new URLSearchParams(window.location.search);
    const token = queryParams.get("token");
    if (!token) {
      createNotification({
        text: "Failed to resend code, no token found",
        type: "error"
      });
      return;
    }
    await sendEmailVerificationCode(token);
    createNotification({
      text: "Successfully resent code",
      type: "success"
    });
  };

  return (
    <div className="mx-auto h-full w-full pb-4 md:px-8">
      <p className="text-md flex justify-center text-bunker-200">
        We&apos;ve sent a verification code to {email}
      </p>
      <div className="mx-auto hidden w-max min-w-[20rem] md:block">
        <ReactCodeInput
          name=""
          inputMode="tel"
          type="text"
          fields={6}
          onChange={setCode}
          {...props}
          className="mt-6 mb-2"
        />
      </div>
      <div className="mx-auto mt-4 block w-max md:hidden">
        <ReactCodeInput
          name=""
          inputMode="tel"
          type="text"
          fields={6}
          onChange={setCode}
          {...propsPhone}
          className="mt-2 mb-2"
        />
      </div>
      {codeError && <Error text="Oops. Your code is wrong. Please try again." />}
      <div className="mx-auto mt-2 flex w-1/4 max-w-xs min-w-[20rem] flex-col items-center justify-center text-center text-sm md:max-w-md md:text-left lg:w-[19%]">
        <div className="text-l w-full py-1 text-lg">
          <Button
            type="submit"
            onClick={checkCode}
            size="sm"
            isFullWidth
            className="h-14"
            colorSchema="primary"
            variant="outline_bg"
            isLoading={isLoading}
          >
            {" "}
            Verify
          </Button>
        </div>
      </div>
      <div className="mx-auto flex max-h-24 w-full max-w-md flex-col items-center justify-center pt-2">
        <div className="flex flex-row items-baseline gap-1 text-sm">
          <span className="text-bunker-400">Don&apos;t see the code?</span>
          <div className="text-md mt-2 flex flex-row text-bunker-400">
            <button disabled={isLoading} onClick={resendCode} type="button">
              <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
                {isResendingVerificationEmail ? "Resending..." : "Resend"}
              </span>
            </button>
          </div>
        </div>
        <p className="pb-2 text-sm text-bunker-400">Make sure to check your spam inbox.</p>
      </div>
    </div>
  );
};
