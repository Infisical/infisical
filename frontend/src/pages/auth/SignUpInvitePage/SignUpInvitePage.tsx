import { useState } from "react";
import { Helmet } from "react-helmet";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import { Mfa } from "@app/components/auth/Mfa";
import InputField from "@app/components/basic/InputField";
import checkPassword from "@app/components/utilities/checks/password/checkPassword";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import {
  completeAccountSignupInvite,
  useSelectOrganization,
  verifySignupInvite
} from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { isLoggedIn } from "@app/hooks/api/reactQuery";

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

export const SignupInvitePage = () => {
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstNameError, setFirstNameError] = useState(false);
  const [lastNameError, setLastNameError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Errors>({});

  const [shouldShowMfa, toggleShowMfa] = useToggle(false);
  const [requiredMfaMethod, setRequiredMfaMethod] = useState(MfaMethod.EMAIL);
  const [mfaSuccessCallback, setMfaSuccessCallback] = useState<() => void>(() => {});
  const navigate = useNavigate();
  const search = useSearch({ from: "/_restrict-login-signup/signupinvite" });
  const parsedUrl = search;
  const token = parsedUrl.token as string;
  const organizationId = parsedUrl.organization_id as string;
  const email = (parsedUrl.to as string)?.replace(" ", "+").trim();

  const queryParams = new URLSearchParams(window.location.search);

  const metadata = queryParams.get("metadata") || undefined;

  const { mutateAsync: selectOrganization } = useSelectOrganization();

  const loggedIn = isLoggedIn();

  // Verifies if the information that the users entered (name, workspace) is there, and if the password matched the criteria.
  const signupErrorCheck = async () => {
    setIsLoading(true);

    let errorCheck = await checkPassword({
      password,
      setErrors
    });

    if (!firstName) {
      setFirstNameError(true);
      errorCheck = true;
    } else {
      setFirstNameError(false);
    }
    if (!lastName) {
      setLastNameError(true);
      errorCheck = true;
    } else {
      setLastNameError(false);
    }

    if (!errorCheck) {
      try {
        const { token: jwtToken } = await completeAccountSignupInvite({
          email,
          password,
          firstName,
          lastName,
          tokenMetadata: metadata
        });

        // unset temporary signup JWT token and set JWT token
        SecurityClient.setSignupToken("");
        SecurityClient.setToken(jwtToken);

        const userOrgs = await fetchOrganizations();

        const orgId = userOrgs[0].id;

        if (!orgId) throw new Error("You are not part of any organization");

        const completeSignupFlow = async () => {
          const {
            token: mfaToken,
            isMfaEnabled,
            mfaMethod
          } = await selectOrganization({
            organizationId: orgId
          });

          if (isMfaEnabled) {
            SecurityClient.setMfaToken(mfaToken);
            if (mfaMethod) {
              setRequiredMfaMethod(mfaMethod);
            }
            toggleShowMfa.on();
            setMfaSuccessCallback(() => completeSignupFlow);
            return;
          }

          localStorage.setItem("orgData.id", orgId);

          navigate({
            to: "/organizations/$orgId/projects",
            params: { orgId }
          });
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

  // Step 4 of the sign up process (download the emergency kit pdf)
  const stepConfirmEmail = (
    <div className="mx-1 mt-14 mb-36 flex w-full max-w-xs flex-col items-center rounded-xl border border-mineshaft-600 bg-mineshaft-800 px-4 py-8 drop-shadow-xl md:mb-16 md:max-w-lg md:px-6">
      <p className="mb-2 flex justify-center text-center text-4xl font-medium text-primary-100">
        Confirm your email
      </p>
      <div className="mx-auto mt-4 mb-2 flex max-h-24 max-w-md flex-col items-center justify-center px-4 text-lg md:p-2">
        <Button
          onClick={async () => {
            try {
              const response = await verifySignupInvite({
                email,
                code: token,
                organizationId
              });

              if (response) {
                // user will have temp token if doesn't have an account
                // then continue with account setup workflow
                if (response?.token) {
                  SecurityClient.setSignupToken(response.token);
                  setStep(2);
                } else if (loggedIn) {
                  navigate({ to: "/login/select-organization", search: { force: true } });
                } else {
                  navigate({ to: "/login" });
                }
              }
            } catch (err) {
              console.error(err);
              navigate({ to: "/requestnewinvite" });
            }
          }}
          size="lg"
        >
          Confirm Email
        </Button>
      </div>
    </div>
  );

  // Because this is the invite signup - we directly go to the last step of signup (email is already verified)
  const main = (
    <div className="mx-auto mt-14 mb-32 w-max rounded-xl border border-mineshaft-600 bg-mineshaft-800 px-8 py-10 drop-shadow-xl md:mb-16">
      <p className="mx-8 mb-6 flex justify-center bg-linear-to-tr from-mineshaft-300 to-white bg-clip-text text-4xl font-bold text-transparent md:mx-16">
        Almost there!
      </p>
      <div className="relative z-0 flex max-h-24 w-full items-center justify-end rounded-lg md:p-2">
        <InputField
          label="First Name"
          onChangeHandler={setFirstName}
          type="name"
          value={firstName}
          isRequired
          errorText="Please input your first name."
          error={firstNameError}
          autoComplete="given-name"
        />
      </div>
      <div className="flex max-h-24 w-full items-center justify-center rounded-lg md:p-2">
        <InputField
          label="Last Name"
          onChangeHandler={setLastName}
          type="name"
          value={lastName}
          isRequired
          errorText="Please input your last name."
          error={lastNameError}
          autoComplete="family-name"
        />
      </div>
      <div className="mt-2 flex max-h-60 w-full flex-col items-center justify-center rounded-lg md:p-2">
        <InputField
          label="Password"
          onChangeHandler={(pass) => {
            setPassword(pass);
            checkPassword({
              password: pass,
              setErrors
            });
          }}
          type="password"
          value={password}
          isRequired
          error={Object.keys(errors).length > 0}
          autoComplete="new-password"
          id="new-password"
        />
        {Object.keys(errors).length > 0 && (
          <div className="mt-4 flex w-full flex-col items-start rounded-md bg-white/5 px-2 py-2">
            <div className="mb-2 text-sm text-gray-400">Password should contain at least:</div>
            {Object.keys(errors).map((key) => {
              if (errors[key as keyof Errors]) {
                return (
                  <div className="items-top ml-1 flex flex-row justify-start" key={key}>
                    <div>
                      <FontAwesomeIcon icon={faXmark} className="text-md mr-2.5 ml-0.5 text-red" />
                    </div>
                    <p className="text-sm text-gray-400">{errors[key as keyof Errors]}</p>
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}
      </div>
      <div className="mx-auto mt-2 flex max-h-24 max-w-max flex-col items-center justify-center px-2 py-3 text-lg md:px-4 md:py-5">
        <Button
          onClick={() => {
            signupErrorCheck();
          }}
          isLoading={isLoading}
          size="lg"
        >
          Sign Up
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
      <Helmet>
        <title>Sign Up</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      {shouldShowMfa ? (
        <Mfa
          email={email}
          successCallback={mfaSuccessCallback}
          method={requiredMfaMethod}
          closeMfa={() => toggleShowMfa.off()}
        />
      ) : (
        <>
          <Link to="/">
            <div className="mt-20 mb-4 flex justify-center">
              <img src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical Logo" />
            </div>
          </Link>
          {step === 1 && stepConfirmEmail}
          {step === 2 && main}
        </>
      )}
    </div>
  );
};
