import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, X } from "lucide-react";

import {
  Button,
  FieldError,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  TextArea,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";
import { initProjectHelper } from "@app/helpers/project";
import { completeAccountSignup, useSelectOrganization } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { onRequestError } from "@app/hooks/api/reactQuery";

import checkPassword from "../utilities/checks/password/checkPassword";
import SecurityClient from "../utilities/SecurityClient";

interface UserInfoStepProps {
  incrementStep: () => void;
  email: string;
  password: string;
  setPassword: (value: string) => void;
  name: string;
  setName: (value: string) => void;
  organizationName: string;
  setOrganizationName: (value: string) => void;
  attributionSource: string;
  setAttributionSource: (value: string) => void;
  providerAuthToken?: string;
}

type Errors = {
  tooShort?: string;
  tooLong?: string;
  noLetterChar?: string;
  noNumOrSpecialChar?: string;
  repeatedChar?: string;
  escapeChar?: string;
  lowEntropy?: string;
  breached?: string;
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
export default function UserInfoStep({
  incrementStep,
  email,
  password,
  setPassword,
  name,
  setName,
  organizationName,
  setOrganizationName,
  attributionSource,
  setAttributionSource,
  providerAuthToken
}: UserInfoStepProps): JSX.Element {
  const [nameError, setNameError] = useState(false);
  const [organizationNameError, setOrganizationNameError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [errors, setErrors] = useState<Errors>({});

  const { mutateAsync: selectOrganization } = useSelectOrganization();
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

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
    if (!organizationName) {
      setOrganizationNameError(true);
      errorCheck = true;
    } else {
      setOrganizationNameError(false);
    }

    errorCheck = await checkPassword({
      password,
      setErrors
    });

    if (!errorCheck) {
      try {
        const response = await completeAccountSignup({
          email,
          password,
          firstName: name.split(" ")[0],
          lastName: name.split(" ").slice(1).join(" "),
          providerAuthToken,
          organizationName,
          attributionSource
        });

        // unset signup JWT token and set JWT token
        SecurityClient.setSignupToken("");
        SecurityClient.setToken(response.token);
        SecurityClient.setProviderAuthToken("");

        if (response.organizationId) {
          await selectOrganization({ organizationId: response.organizationId });
        }

        const userOrgs = await fetchOrganizations();

        const orgId = userOrgs[0]?.id;
        await initProjectHelper({
          projectName: "Example Project"
        });

        localStorage.setItem("orgData.id", orgId);

        incrementStep();
      } catch (error) {
        onRequestError(error);
        setIsLoading(false);
        console.error(error);
      }
    } else {
      setIsLoading(false);
    }
  };

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
              onChange={(e) => setName(e.target.value)}
              value={name}
              required
              autoComplete="given-name"
              isError={nameError}
            />
            {nameError && <FieldError>Please, specify your name</FieldError>}
          </div>
          <div className="flex w-full flex-col items-stretch py-2">
            <p className="mb-1 ml-1 text-sm font-medium text-bunker-300">Organization Name</p>
            <UnstableInput
              placeholder="Infisical"
              onChange={(e) => setOrganizationName(e.target.value)}
              value={organizationName}
              maxLength={64}
              required
              isError={organizationNameError}
            />
            {organizationNameError && (
              <FieldError>Please, specify your organization name</FieldError>
            )}
          </div>
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
          <div className="flex w-full flex-col items-stretch py-2">
            <p className="mb-1 ml-1 text-sm font-medium text-bunker-300">
              {t("section.password.password")}
            </p>
            <InputGroup className="h-10">
              <InputGroupInput
                value={password}
                onChange={async (e) => {
                  setPassword(e.target.value);
                  await checkPassword({ password: e.target.value, setErrors });
                }}
                type={showPassword ? "text" : "password"}
                placeholder="Enter a strong password..."
                required
                autoComplete="new-password"
                id="new-password"
              />
              <InputGroupAddon align="inline-end">
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </UnstableIconButton>
              </InputGroupAddon>
            </InputGroup>
            {Object.keys(errors).length > 0 && (
              <div className="mt-4 flex w-full flex-col items-start rounded-md border border-border bg-container px-3 py-2.5">
                <div className="mb-1 text-sm text-gray-400">
                  {t("section.password.validate-base")}
                </div>
                {Object.keys(errors).map((key) => {
                  if (errors[key as keyof Errors]) {
                    return (
                      <div className="items-top flex flex-row justify-start" key={key}>
                        <X className="mt-0.5 mr-2 size-4 shrink-0 text-danger" />
                        <p className="text-sm text-gray-400">{errors[key as keyof Errors]}</p>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </div>
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
}
