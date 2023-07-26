
import crypto from "crypto";

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import jsrp from "jsrp";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";

import InputField from "@app/components/basic/InputField";
import checkPassword from "@app/components/utilities/checks/checkPassword";
import Aes256Gcm from "@app/components/utilities/cryptography/aes-256-gcm";
import { deriveArgonKey } from "@app/components/utilities/cryptography/crypto";
import { saveTokenToLocalStorage } from "@app/components/utilities/saveTokenToLocalStorage";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, Input } from "@app/components/v2";
import { useGetCommonPasswords } from "@app/hooks/api";
import completeAccountInformationSignup from "@app/pages/api/auth/CompleteAccountInformationSignup";
import getOrganizations from "@app/pages/api/organization/getOrgs";
import ProjectService from "@app/services/ProjectService";

// eslint-disable-next-line new-cap
const client = new jsrp.client();

type Props = {
    setStep: (step: number) => void;
    email: string;
    password: string;
    setPassword: (value: string) => void;
    name: string;
    providerOrganizationName: string;
    providerAuthToken?: string;
}

type Errors = {
  length?: string,
  upperCase?: string,
  lowerCase?: string,
  number?: string,
  specialChar?: string,
  repeatedChar?: string,
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
  email,
  name,
  providerOrganizationName,
  password,
  setPassword,
  setStep,
  providerAuthToken,
}: Props) => {
  const { data: commonPasswords } = useGetCommonPasswords();
  const [nameError, setNameError] = useState(false);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationNameError, setOrganizationNameError] = useState(false);
  const [attributionSource, setAttributionSource] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
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
    if (!organizationName) {
      setOrganizationNameError(true);
      errorCheck = true;
    } else {
      setOrganizationNameError(false);
    }
    
    errorCheck = checkPassword({
      password,
      commonPasswords,
      setErrors
    });

    if (!errorCheck) {
      // Generate a random pair of a public and a private key
      const pair = nacl.box.keyPair();
      const secretKeyUint8Array = pair.secretKey;
      const publicKeyUint8Array = pair.publicKey;
      const privateKey = encodeBase64(secretKeyUint8Array);
      const publicKey = encodeBase64(publicKeyUint8Array);
      localStorage.setItem("PRIVATE_KEY", privateKey);

      client.init(
        {
          username: email,
          password
        },
        async () => {
          client.createVerifier(async (err: any, result: { salt: string; verifier: string }) => {
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
                text: privateKey,
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

              const response = await completeAccountInformationSignup({
                email,
                firstName: name.split(" ")[0],
                lastName: name.split(" ").slice(1).join(" "),
                protectedKey,
                protectedKeyIV,
                protectedKeyTag,
                publicKey,
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

              saveTokenToLocalStorage({
                publicKey,
                encryptedPrivateKey,
                iv: encryptedPrivateKeyIV,
                tag: encryptedPrivateKeyTag,
                privateKey
              });

              const userOrgs = await getOrganizations();
              const orgId = userOrgs[0]?._id;
              const project = await ProjectService.initProject({
                organizationId: orgId,
                projectName: "Example Project"
              });

              localStorage.setItem("orgData.id", orgId);
              localStorage.setItem("projectData.id", project._id);

                setStep(1);
            } catch (error) {
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
    <div className="h-full mx-auto mb-36 w-max rounded-xl md:px-8 md:mb-16">
      <p className="mx-8 mb-6 flex justify-center text-xl font-bold text-medium md:mx-16 text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200">
        {t("signup.step3-message")}
      </p>
      <div className="h-full mx-auto mb-36 w-max rounded-xl py-6 md:px-8 md:mb-16 md:border md:border-mineshaft-600 md:bg-mineshaft-800">
        <div className="relative z-0 lg:w-1/6 w-1/4 min-w-[20rem] flex flex-col items-center justify-end w-full py-2 rounded-lg">
          <p className='text-left w-full text-sm text-bunker-300 mb-1 ml-1 font-medium'>Your Name</p>
          <Input
            placeholder="Jane Doe"
            value={name}
            disabled
            isRequired
            autoComplete="given-name"
            className="h-12"
          />
          {nameError && <p className='text-left w-full text-xs text-red-600 mt-1 ml-1'>Please, specify your name</p>}
        </div>
        {providerOrganizationName === undefined && (
          <div className="relative z-0 lg:w-1/6 w-1/4 min-w-[20rem] flex flex-col items-center justify-end w-full py-2 rounded-lg">
            <p className='text-left w-full text-sm text-bunker-300 mb-1 ml-1 font-medium'>Organization Name</p>
            <Input
              placeholder="Infisical"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              isRequired
              className="h-12"
              disabled
            />
            {organizationNameError && <p className='text-left w-full text-xs text-red-600 mt-1 ml-1'>Please, specify your organization name</p>}
          </div>
        )}
        {providerOrganizationName === undefined && (
          <div className="relative z-0 lg:w-1/6 w-1/4 min-w-[20rem] flex flex-col items-center justify-end w-full py-2 rounded-lg">
            <p className='text-left w-full text-sm text-bunker-300 mb-1 ml-1 font-medium'>Where did you hear about us? <span className="font-light">(optional)</span></p>
            <Input
              placeholder=""
              onChange={(e) => setAttributionSource(e.target.value)}
              value={attributionSource}
              className="h-12"
            />
          </div>
        )}
        <div className="mt-2 flex lg:w-1/6 w-1/4 min-w-[20rem] max-h-60 w-full flex-col items-center justify-center rounded-lg py-2">
          <InputField
            label={t("section.password.password")}
            onChangeHandler={(pass: string) => {
              setPassword(pass);
              checkPassword({
                password: pass,
                commonPasswords,
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
              <div className="mb-2 text-sm text-gray-400">{t("section.password.validate-base")}</div> 
              {Object.keys(errors).map((key) => {
                if (errors[key as keyof Errors]) {
                  return (
                    <div 
                      className="ml-1 flex flex-row items-top justify-start"
                      key={key}
                    >
                      <div>
                        <FontAwesomeIcon 
                          icon={faXmark} 
                          className="text-md text-red ml-0.5 mr-2.5"
                        />
                      </div>
                      <p className="text-gray-400 text-sm">
                        {errors[key as keyof Errors]} 
                      </p>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          )}
        </div>
        <div className="flex flex-col items-center justify-center lg:w-[19%] w-1/4 min-w-[20rem] mt-2 max-w-xs md:max-w-md mx-auto text-sm text-center md:text-left">
          <div className="text-l py-1 text-lg w-full">
            <Button
              type="submit"
              onClick={signupErrorCheck}
              size="sm"
              isFullWidth
              className='h-14'
              colorSchema="primary"
              variant="outline_bg"
              isLoading={isLoading}
            > {String(t("signup.signup"))} </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
