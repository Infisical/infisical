import crypto from "crypto";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import { Mfa } from "@app/components/auth/Mfa";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  Button,
  FieldError,
  TextArea,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableInput
} from "@app/components/v3";
import { isInfisicalCloud } from "@app/helpers/platform";
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

export const UserInfoSSOStep = ({
  username,
  name,
  providerOrganizationName,
  password,
  setPassword,
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
          organizationName,
          attributionSource
        });

        // unset signup JWT token and set JWT token
        SecurityClient.setSignupToken("");
        SecurityClient.setToken(response.token);
        SecurityClient.setProviderAuthToken("");

        if (isInfisicalCloud()) {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({ event: "signup_completed" });
        }

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
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <UnstableCard className="mx-auto w-full max-w-sm items-stretch gap-0 p-6">
        <UnstableCardHeader className="mb-4 gap-2">
          <UnstableCardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.65rem] font-medium text-transparent">
            {t("signup.step3-message")}
          </UnstableCardTitle>
        </UnstableCardHeader>
        <UnstableCardContent>
          <div className="flex w-full flex-col items-stretch py-2">
            <p className="mb-1 ml-1 text-sm font-medium text-bunker-300">Your Name</p>
            <UnstableInput
              placeholder="Jane Doe"
              value={name}
              disabled
              required
              autoComplete="given-name"
              isError={nameError}
            />
            {nameError && <FieldError>Please, specify your name</FieldError>}
          </div>
          {!forceDefaultOrg && providerOrganizationName === undefined && (
            <div className="flex w-full flex-col items-stretch py-2">
              <p className="mb-1 ml-1 text-sm font-medium text-bunker-300">Organization Name</p>
              <UnstableInput
                placeholder="Infisical"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                required
                maxLength={64}
                disabled={forceDefaultOrg}
                isError={organizationNameError}
              />
              {organizationNameError && (
                <FieldError>Please, specify your organization name</FieldError>
              )}
            </div>
          )}
          {providerOrganizationName === undefined && (
            <div className="flex w-full flex-col items-stretch py-2">
              <p className="mb-1 ml-1 text-sm font-medium text-bunker-300">
                Where did you hear about us? <span className="font-light">(optional)</span>
              </p>
              <TextArea
                placeholder=""
                onChange={(e) => setAttributionSource(e.target.value)}
                value={attributionSource}
                rows={2}
              />
            </div>
          )}
          <div className="mt-4 w-full">
            <Button
              type="submit"
              onClick={signupErrorCheck}
              variant="project"
              size="lg"
              isFullWidth
              isPending={isLoading}
              isDisabled={isLoading}
            >
              {String(t("signup.signup"))}
            </Button>
          </div>
        </UnstableCardContent>
      </UnstableCard>
    </div>
  );
};
