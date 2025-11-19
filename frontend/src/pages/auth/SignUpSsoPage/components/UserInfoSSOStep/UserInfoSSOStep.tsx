import crypto from "crypto";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import { Mfa } from "@app/components/auth/Mfa";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, Input } from "@app/components/v2";
import { initProjectHelper } from "@app/helpers/project";
import { useToggle } from "@app/hooks";
import { completeAccountSignup, useSelectOrganization } from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";

type Props = {
  username: string;
  password: string;
  setPassword: (value: string) => void;
  name: string;
  providerOrganizationName: string;
  providerAuthToken?: string;
  forceDefaultOrg?: boolean;
};

/**
 * This is the step of the sign up flow where people provife their name/surname and password
 * @param {object} obj
 * @param {string} obj.verificationToken - the token which we use to verify the legitness of a user
 * @param {string} obj.incrementStep - a function to move to the next signup step
 * @param {string} obj.email - email of a user who is signing up
 * @param {string} obj.password - user's password
 * @param {string} obj.setPassword - function managing the state of user's password
 * @param {string} obj.firstName - user's first name
 * @param {string} obj.setFirstName  - function managing the state of user's first name
 * @param {string} obj.lastName - user's lastName
 * @param {string} obj.setLastName - function managing the state of user's last name
 */
export const UserInfoSSOStep = ({
  username,
  name,
  providerOrganizationName,
  password,
  setPassword,
  providerAuthToken,
  forceDefaultOrg
}: Props) => {
  const [nameError, setNameError] = useState(false);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationNameError, setOrganizationNameError] = useState(false);
  const [attributionSource, setAttributionSource] = useState("");
  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(MfaMethod.EMAIL);
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();
  const { mutateAsync: selectOrganization } = useSelectOrganization();
  const [mfaSuccessCallback, setMfaSuccessCallback] = useState<() => void>(() => {});
  const navigate = useNavigate();

  useEffect(() => {
    const randomPassword = crypto.randomBytes(32).toString("hex");
    setPassword(randomPassword);
    if (providerOrganizationName !== undefined) {
      setOrganizationName(providerOrganizationName);
    }
  }, []);

  // Verifies if the information that the users entered (name, workspace)
  // is there, and if the password matches the criteria.
  const signupErrorCheck = async () => {
    setIsLoading(true);
    let errorCheck = false;
    if (!name) {
      setNameError(true);
      errorCheck = true;
    } else {
      setNameError(false);
    }
    if (!organizationName && !forceDefaultOrg) {
      setOrganizationNameError(true);
      errorCheck = true;
    } else {
      setOrganizationNameError(false);
    }

    if (!errorCheck) {
      try {
        const response = await completeAccountSignup({
          email: username,
          password,
          firstName: name.split(" ")[0],
          lastName: name.split(" ").slice(1).join(" "),
          providerAuthToken,
          organizationName,
          attributionSource,
          useDefaultOrg: forceDefaultOrg
        });

        // unset signup JWT token and set JWT token
        SecurityClient.setSignupToken("");
        SecurityClient.setToken(response.token);
        SecurityClient.setProviderAuthToken("");

        const userOrgs = await fetchOrganizations();
        const orgId = userOrgs[0]?.id;

        const completeSignupFlow = async () => {
          try {
            const { isMfaEnabled, token, mfaMethod } = await selectOrganization({
              organizationId: orgId
            });

            if (isMfaEnabled) {
              SecurityClient.setMfaToken(token);
              if (mfaMethod) {
                setRequiredMfaMethod(mfaMethod);
              }
              toggleShowMfa.on();
              setMfaSuccessCallback(() => completeSignupFlow);
              return;
            }

            // only create example project if not joining existing org
            if (!providerOrganizationName) {
              await initProjectHelper({
                projectName: "Example Project"
              });
            }

            localStorage.setItem("orgData.id", orgId);
            navigate({
              to: "/organizations/$orgId/projects",
              params: { orgId }
            });
          } catch (error) {
            setIsLoading(false);
            console.error(error);
          }
        };

        await completeSignupFlow();
      } catch (error) {
        setIsLoading(false);
        console.error(error);
      }
    } else {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (password && providerOrganizationName) {
      signupErrorCheck();
    }
  }, [providerOrganizationName, password]);

  if (shouldShowMfa) {
    return (
      <Mfa
        hideLogo
        email={username}
        successCallback={mfaSuccessCallback}
        method={requiredMfaMethod}
        closeMfa={() => toggleShowMfa.off()}
      />
    );
  }

  return (
    <div className="mx-auto mb-36 h-full w-max rounded-xl md:mb-16 md:px-8">
      <p className="text-medium mx-8 mb-6 flex justify-center bg-linear-to-b from-white to-bunker-200 bg-clip-text text-xl font-bold text-transparent md:mx-16">
        {t("signup.step3-message")}
      </p>
      <div className="mx-auto mb-36 h-full w-max rounded-xl py-6 md:mb-16 md:border md:border-mineshaft-600 md:bg-mineshaft-800 md:px-8">
        <div className="relative z-0 flex w-full min-w-[20rem] flex-col items-center justify-end rounded-lg py-2 lg:w-1/6">
          <p className="mb-1 ml-1 w-full text-left text-sm font-medium text-bunker-300">
            Your Name
          </p>
          <Input
            placeholder="Jane Doe"
            value={name}
            disabled
            isRequired
            autoComplete="given-name"
            className="h-12"
          />
          {nameError && (
            <p className="mt-1 ml-1 w-full text-left text-xs text-red-600">
              Please, specify your name
            </p>
          )}
        </div>
        {!forceDefaultOrg && providerOrganizationName === undefined && (
          <div className="relative z-0 flex w-full min-w-[20rem] flex-col items-center justify-end rounded-lg py-2 lg:w-1/6">
            <p className="mb-1 ml-1 w-full text-left text-sm font-medium text-bunker-300">
              Organization Name
            </p>
            <Input
              placeholder="Infisical"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              isRequired
              className="h-12"
              maxLength={64}
              isDisabled={forceDefaultOrg}
            />
            {organizationNameError && (
              <p className="mt-1 ml-1 w-full text-left text-xs text-red-600">
                Please, specify your organization name
              </p>
            )}
          </div>
        )}
        {providerOrganizationName === undefined && (
          <div className="relative z-0 flex w-full min-w-[20rem] flex-col items-center justify-end rounded-lg py-2 lg:w-1/6">
            <p className="mb-1 ml-1 w-full text-left text-sm font-medium text-bunker-300">
              Where did you hear about us? <span className="font-light">(optional)</span>
            </p>
            <Input
              placeholder=""
              onChange={(e) => setAttributionSource(e.target.value)}
              value={attributionSource}
              className="h-12"
            />
          </div>
        )}
        <div className="mx-auto mt-2 flex w-1/4 max-w-xs min-w-[20rem] flex-col items-center justify-center text-center text-sm md:max-w-md md:text-left lg:w-[19%]">
          <div className="text-l w-full py-1 text-lg">
            <Button
              type="submit"
              onClick={signupErrorCheck}
              size="sm"
              isFullWidth
              className="h-12"
              colorSchema="primary"
              variant="outline_bg"
              isLoading={isLoading}
              isDisabled={isLoading}
            >
              {" "}
              {String(t("signup.signup"))}{" "}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
