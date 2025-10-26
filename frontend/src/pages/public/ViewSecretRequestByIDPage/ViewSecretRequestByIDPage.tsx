import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";
import { AxiosError } from "axios";
import { addSeconds, formatISO } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { SessionStorageKeys } from "@app/const";
import { ROUTE_PATHS } from "@app/const/routes";
import { useGetSecretRequestById } from "@app/hooks/api/secretSharing";

import { SecretRequestErrorContainer } from "./components/SecretErrorContainer";
import { SecretRequestContainer } from "./components/SecretRequestContainer";
import { SecretRequestSuccessContainer } from "./components/SecretRequestSuccessContainer";
import { SecretValueAlreadySharedContainer } from "./components/SecretValueAlreadySharedContainer";

export const ViewSecretRequestByIDPage = () => {
  const id = useParams({
    from: ROUTE_PATHS.Public.ViewSecretRequestByIDPage.id,
    select: (el) => el.secretRequestId
  });

  const [step, setStep] = useState<"set-value" | "success">("set-value");

  const {
    data: secretRequest,
    error,
    isPending
  } = useGetSecretRequestById({
    secretRequestId: id
  });

  const navigate = useNavigate();

  const statusCode = ((error as AxiosError)?.response?.data as { statusCode: number })?.statusCode;
  const message = ((error as AxiosError)?.response?.data as { message: string })?.message;

  const isUnauthorized = statusCode === 401;
  const isForbidden = statusCode === 403;
  const isInvalidCredential = message === "Invalid credentials";

  useEffect(() => {
    if (isUnauthorized && !isInvalidCredential) {
      // persist current URL in session storage so that we can come back to this after successful login
      sessionStorage.setItem(
        SessionStorageKeys.ORG_LOGIN_SUCCESS_REDIRECT_URL,
        JSON.stringify({
          expiry: formatISO(addSeconds(new Date(), 60)),
          data: window.location.href
        })
      );

      createNotification({
        type: "info",
        text: "Login is required in order to access the shared secret."
      });

      navigate({
        to: "/login"
      });
    }

    if (isForbidden) {
      createNotification({
        type: "error",
        text: "You do not have access to this shared secret."
      });
    }
  }, [error]);

  return (
    <>
      <Helmet>
        <title>Securely Share Secrets | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="" />
        <meta name="og:description" content="" />
      </Helmet>
      <div className="flex h-screen flex-col justify-between overflow-auto bg-linear-to-tr from-mineshaft-700 to-bunker-800 text-gray-200 dark:scheme-dark">
        <div />
        <div className="mx-auto w-full max-w-xl px-4 py-4 md:px-0">
          <div className="mb-8 text-center">
            <div className="mb-4 flex justify-center pt-8">
              <a target="_blank" rel="noopener noreferrer" href="https://infisical.com">
                <img
                  src="/images/gradientLogo.svg"
                  height={90}
                  width={120}
                  alt="Infisical logo"
                  className="cursor-pointer"
                />
              </a>
            </div>
            <h1 className="bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-4xl font-medium text-transparent">
              {step === "set-value" ? "Secret Request" : "Secret request shared"}
            </h1>
            <p className="text-sm text-mineshaft-300">
              Secret requested by {secretRequest?.requester.username} from the{" "}
              {secretRequest?.requester.organizationName} organization
            </p>
            <p className="text-md mt-2">
              Powered by{" "}
              <a
                href="https://github.com/infisical/infisical"
                target="_blank"
                rel="noopener noreferrer"
                className="text-bold bg-linear-to-tr from-yellow-500 to-primary-500 bg-clip-text text-transparent"
              >
                Infisical &rarr;
              </a>
            </p>
          </div>
          {!isPending && (
            <>
              {!error &&
                secretRequest &&
                step === "set-value" &&
                !secretRequest.isSecretValueSet && (
                  <SecretRequestContainer
                    onSuccess={() => setStep("success")}
                    secretRequestId={id}
                  />
                )}
              {secretRequest?.isSecretValueSet && <SecretValueAlreadySharedContainer />}
              {error && !isInvalidCredential && !isUnauthorized && <SecretRequestErrorContainer />}
              {step === "success" && (
                <SecretRequestSuccessContainer
                  requesterUsername={secretRequest!.requester.username}
                />
              )}
            </>
          )}
          <div className="m-auto my-8 flex w-full">
            <div className="w-full border-t border-mineshaft-600" />
          </div>
          <div className="m-auto flex w-full flex-col rounded-md border border-primary-500/30 bg-primary/5 p-6 pt-5">
            <p className="w-full pb-2 text-lg font-medium text-mineshaft-100 md:pb-3 md:text-xl">
              Open source{" "}
              <span className="bg-linear-to-tr from-yellow-500 to-primary-500 bg-clip-text text-transparent">
                secret management
              </span>{" "}
              for developers
            </p>
            <div className="flex flex-col items-start sm:flex-row sm:items-center">
              <p className="md:text-md text-md mr-4">
                <a
                  href="https://github.com/infisical/infisical"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bold bg-linear-to-tr from-yellow-500 to-primary-500 bg-clip-text text-transparent"
                >
                  Infisical
                </a>{" "}
                is the all-in-one secret management platform to securely manage secrets, configs,
                and certificates across your team and infrastructure.
              </p>
              <div className="mt-4 cursor-pointer sm:mt-0">
                <a target="_blank" rel="noopener noreferrer" href="https://infisical.com">
                  <div className="flex items-center justify-between rounded-md border border-mineshaft-400/40 bg-mineshaft-600 px-3 py-2 duration-200 hover:border-primary/60 hover:bg-primary/20 hover:text-white">
                    <p className="mr-4 whitespace-nowrap">Try Infisical</p>
                    <FontAwesomeIcon icon={faArrowRight} />
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
        <div className="w-full bg-mineshaft-600 p-2">
          <p className="text-center text-sm text-mineshaft-300">
            Made with ❤️ by{" "}
            <a className="text-primary" href="https://infisical.com">
              Infisical
            </a>
            <br />
            235 2nd st, San Francisco, California, 94105, United States. 🇺🇸
          </p>
        </div>
      </div>
    </>
  );
};
