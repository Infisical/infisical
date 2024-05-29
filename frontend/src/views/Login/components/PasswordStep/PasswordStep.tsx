import { useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useRouter } from "next/router";
import axios from "axios";
import jwt_decode from "jwt-decode";

import { createNotification } from "@app/components/notifications";
import attemptCliLogin from "@app/components/utilities/attemptCliLogin";
import attemptLogin from "@app/components/utilities/attemptLogin";
import { Button, Input } from "@app/components/v2";
import { useUpdateUserAuthMethods } from "@app/hooks/api";
import { useSelectOrganization } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { fetchUserDetails } from "@app/hooks/api/users/queries";

import { navigateUserToOrg, navigateUserToSelectOrg } from "../../Login.utils";

type Props = {
  providerAuthToken: string;
  email: string;
  password: string;
  setPassword: (password: string) => void;
  setStep: (step: number) => void;
};

export const PasswordStep = ({
  providerAuthToken,
  email,
  password,
  setPassword,
  setStep
}: Props) => {
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();
  const router = useRouter();
  const { mutateAsync } = useUpdateUserAuthMethods();
  const { mutateAsync: selectOrganization } = useSelectOrganization();

  const { callbackPort, isLinkingRequired, authMethod, organizationId } = jwt_decode(
    providerAuthToken
  ) as any;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);

      if (callbackPort) {
        // attemptCliLogin
        const isCliLoginSuccessful = await attemptCliLogin({
          email,
          password,
          providerAuthToken
        });

        if (isCliLoginSuccessful && isCliLoginSuccessful.success) {
          if (isCliLoginSuccessful.mfaEnabled) {
            // case: login requires MFA step
            setStep(2);
            setIsLoading(false);
            return;
          }
          const cliUrl = `http://127.0.0.1:${callbackPort}/`;

          // case: organization ID is present from the provider auth token -- select the org and use the new jwt token in the CLI, then navigate to the org
          if (organizationId) {
            const { token: newJwtToken } = await selectOrganization({ organizationId });

            console.log(
              "organization id was present. new JWT token to be used in CLI:",
              newJwtToken
            );

            const instance = axios.create();
            await instance.post(cliUrl, {
              ...isCliLoginSuccessful.loginResponse,
              JTWToken: newJwtToken
            });

            await navigateUserToOrg(router, organizationId);
          }
          // case: no organization ID is present -- navigate to the select org page IF the user has any orgs
          // if the user has no orgs, navigate to the create org page
          else {
            const userOrgs = await fetchOrganizations();

            // case: user has orgs, so we navigate the user to select an org
            if (userOrgs.length > 0) {
              navigateUserToSelectOrg(router, callbackPort);
            }
            // case: no orgs found, so we navigate the user to create an org
            else {
              await navigateUserToOrg(router);
            }
          }
        }
      } else {
        const loginAttempt = await attemptLogin({
          email,
          password,
          providerAuthToken
        });

        if (loginAttempt && loginAttempt.success) {
          // case: login was successful

          if (loginAttempt.mfaEnabled) {
            // TODO: deal with MFA
            // case: login requires MFA step
            setIsLoading(false);
            setStep(2);
            return;
          }

          // case: login does not require MFA step
          setIsLoading(false);
          createNotification({
            text: "Successfully logged in",
            type: "success"
          });

          if (isLinkingRequired) {
            const user = await fetchUserDetails();
            const newAuthMethods = [...user.authMethods, authMethod];
            await mutateAsync({
              authMethods: newAuthMethods
            });
          }

          // case: organization ID is present from the provider auth token -- navigate directly to the org
          if (organizationId) {
            await navigateUserToOrg(router, organizationId);
          }
          // case: no organization ID is present -- navigate to the select org page IF the user has any orgs
          // if the user has no orgs, navigate to the create org page
          else {
            const userOrgs = await fetchOrganizations();

            if (userOrgs.length > 0) {
              navigateUserToSelectOrg(router);
            } else {
              await navigateUserToOrg(router);
            }
          }
        }
      }
    } catch (err: any) {
      setIsLoading(false);
      console.error(err);

      if (err.response.data.error === "User Locked") {
        createNotification({
          title: err.response.data.error,
          text: err.response.data.message,
          type: "error"
        });
        return;
      }

      createNotification({
        text: "Login unsuccessful. Double-check your master password and try again.",
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleLogin} className="mx-auto h-full w-full max-w-md px-6 pt-8">
      <div className="mb-8">
        <p className="mx-auto mb-4 flex w-max justify-center bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
          {isLinkingRequired ? "Link your account" : "What's your Infisical password?"}
        </p>
        {isLinkingRequired && (
          <div className="mx-auto flex w-max flex-col items-center text-xs text-bunker-400">
            <span className="max-w-sm px-4 text-center duration-200">
              An existing account without this SSO authentication method enabled was found under the
              same email. Login with your password to link the account.
            </span>
          </div>
        )}
      </div>
      <div className="relative mx-auto flex max-h-24 w-1/4 w-full min-w-[22rem] items-center justify-center rounded-lg md:max-h-28 lg:w-1/6">
        <div className="flex max-h-24 w-full items-center justify-center rounded-lg md:max-h-28">
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Enter your password..."
            isRequired
            autoComplete="current-password"
            id="current-password"
            className="h-12"
          />
        </div>
      </div>
      <div className="mx-auto mt-4 flex w-1/4 w-full min-w-[22rem] items-center justify-center rounded-md text-center lg:w-1/6">
        <Button
          type="submit"
          colorSchema="primary"
          variant="outline_bg"
          isFullWidth
          isLoading={isLoading}
          className="h-14"
        >
          {t("login.login")}
        </Button>
      </div>
      <div className="mx-auto mt-4 flex w-max flex-col items-center text-xs text-bunker-400">
        <span className="max-w-sm px-4 text-center duration-200">
          Infisical Master Password serves as a decryption mechanism so that even Google is not able
          to access your secrets.
        </span>
        <Link href="/verify-email">
          <span className="mt-2 cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
            {t("login.forgot-password")}
          </span>
        </Link>
      </div>
      <div className="flex flex-row items-center justify-center">
        <button
          onClick={() => {
            router.push("/login");
          }}
          type="button"
          className="mt-2 cursor-pointer text-xs text-bunker-400 duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4"
        >
          {t("login.other-option")}
        </button>
      </div>
    </form>
  );
};
