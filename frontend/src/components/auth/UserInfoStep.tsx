import crypto from "crypto";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import jsrp from "jsrp";

import { useServerConfig } from "@app/context";
import { initProjectHelper } from "@app/helpers/project";
import { completeAccountSignup, useSelectOrganization } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { onRequestError } from "@app/hooks/api/reactQuery";

import InputField from "../basic/InputField";
import checkPassword from "../utilities/checks/password/checkPassword";
import Aes256Gcm from "../utilities/cryptography/aes-256-gcm";
import { deriveArgonKey, generateKeyPair } from "../utilities/cryptography/crypto";
import { saveTokenToLocalStorage } from "../utilities/saveTokenToLocalStorage";
import SecurityClient from "../utilities/SecurityClient";
import { Button, Input } from "../v2";

// eslint-disable-next-line new-cap
const client = new jsrp.client();

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
  const { config } = useServerConfig();

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
      // Generate a random pair of a public and a private key
      const pair = await generateKeyPair(config.fipsEnabled);

      localStorage.setItem("PRIVATE_KEY", pair.privateKey);

      client.init(
        {
          username: email,
          password
        },
        async () => {
          client.createVerifier(async (_err: any, result: { salt: string; verifier: string }) => {
            try {
              // TODO: moduralize into KeyService
              const derivedKey = await deriveArgonKey({
                password,
                salt: result.salt,
                mem: 65536,
                time: 3,
                parallelism: 1,
                hashLen: 32
              });

              if (!derivedKey) throw new Error("Failed to derive key from password");

              const key = crypto.randomBytes(32);

              // create encrypted private key by encrypting the private
              // key with the symmetric key [key]
              const {
                ciphertext: encryptedPrivateKey,
                iv: encryptedPrivateKeyIV,
                tag: encryptedPrivateKeyTag
              } = Aes256Gcm.encrypt({
                text: pair.privateKey,
                secret: key
              });

              // create the protected key by encrypting the symmetric key
              // [key] with the derived key
              const {
                ciphertext: protectedKey,
                iv: protectedKeyIV,
                tag: protectedKeyTag
              } = Aes256Gcm.encrypt({
                text: key.toString("hex"),
                secret: Buffer.from(derivedKey.hash)
              });

              const response = await completeAccountSignup({
                email,
                password,
                firstName: name.split(" ")[0],
                lastName: name.split(" ").slice(1).join(" "),
                protectedKey,
                protectedKeyIV,
                protectedKeyTag,
                publicKey: pair.publicKey,
                encryptedPrivateKey,
                encryptedPrivateKeyIV,
                encryptedPrivateKeyTag,
                providerAuthToken,
                salt: result.salt,
                verifier: result.verifier,
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

              saveTokenToLocalStorage({
                publicKey: pair.publicKey,
                encryptedPrivateKey,
                iv: encryptedPrivateKeyIV,
                tag: encryptedPrivateKeyTag,
                privateKey: pair.privateKey
              });

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
          });
        }
      );
    } else {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto mb-36 h-full w-max rounded-xl md:mb-16 md:px-8">
      <p className="text-medium mx-8 mb-6 flex justify-center bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-xl font-bold text-transparent md:mx-16">
        {t("signup.step3-message")}
      </p>
      <div className="mx-auto mb-36 h-full w-max rounded-xl py-6 md:mb-16 md:border md:border-mineshaft-600 md:bg-mineshaft-800 md:px-8">
        <div className="relative z-0 flex w-full min-w-[20rem] flex-col items-center justify-end rounded-lg py-2 lg:w-1/6">
          <p className="mb-1 ml-1 w-full text-left text-sm font-medium text-bunker-300">
            Your Name
          </p>
          <Input
            placeholder="Jane Doe"
            onChange={(e) => setName(e.target.value)}
            value={name}
            isRequired
            autoComplete="given-name"
            className="h-12"
          />
          {nameError && (
            <p className="ml-1 mt-1 w-full text-left text-xs text-red-600">
              Please, specify your name
            </p>
          )}
        </div>
        <div className="relative z-0 flex w-full min-w-[20rem] flex-col items-center justify-end rounded-lg py-2 lg:w-1/6">
          <p className="mb-1 ml-1 w-full text-left text-sm font-medium text-bunker-300">
            Organization Name
          </p>
          <Input
            placeholder="Infisical"
            onChange={(e) => setOrganizationName(e.target.value)}
            value={organizationName}
            maxLength={64}
            isRequired
            className="h-12"
          />
          {organizationNameError && (
            <p className="ml-1 mt-1 w-full text-left text-xs text-red-600">
              Please, specify your organization name
            </p>
          )}
        </div>
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
        <div className="mt-2 flex max-h-60 w-full min-w-[20rem] flex-col items-center justify-center rounded-lg py-2 lg:w-1/6">
          <InputField
            label={t("section.password.password")}
            onChangeHandler={async (pass: string) => {
              setPassword(pass);
              await checkPassword({
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
              <div className="mb-2 text-sm text-gray-400">
                {t("section.password.validate-base")}
              </div>
              {Object.keys(errors).map((key) => {
                if (errors[key as keyof Errors]) {
                  return (
                    <div className="items-top ml-1 flex flex-row justify-start" key={key}>
                      <div>
                        <FontAwesomeIcon
                          icon={faXmark}
                          className="text-md ml-0.5 mr-2.5 text-red"
                        />
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
        <div className="mx-auto mt-2 flex w-1/4 min-w-[20rem] max-w-xs flex-col items-center justify-center text-center text-sm md:max-w-md md:text-left lg:w-[19%]">
          <div className="text-l w-full py-1 text-lg">
            <Button
              type="submit"
              onClick={signupErrorCheck}
              size="sm"
              isFullWidth
              className="h-14"
              colorSchema="primary"
              variant="outline_bg"
              isLoading={isLoading}
            >
              {" "}
              {String(t("signup.signup"))}{" "}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
