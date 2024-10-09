import crypto from "crypto";

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import jsrp from "jsrp";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";

import Aes256Gcm from "@app/components/utilities/cryptography/aes-256-gcm";
import { deriveArgonKey } from "@app/components/utilities/cryptography/crypto";
import { saveTokenToLocalStorage } from "@app/components/utilities/saveTokenToLocalStorage";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, Input } from "@app/components/v2";
import { completeAccountSignup, useSelectOrganization } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import ProjectService from "@app/services/ProjectService";

// eslint-disable-next-line new-cap
const client = new jsrp.client();

type Props = {
  setStep: (step: number) => void;
  username: string;
  password: string;
  setPassword: (value: string) => void;
  name: string;
  providerOrganizationName: string;
  providerAuthToken?: string;
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
  setStep,
  providerAuthToken
}: Props) => {
  const [nameError, setNameError] = useState(false);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationNameError, setOrganizationNameError] = useState(false);
  const [attributionSource, setAttributionSource] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();
  const { mutateAsync: selectOrganization } = useSelectOrganization();

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
    if (!organizationName) {
      setOrganizationNameError(true);
      errorCheck = true;
    } else {
      setOrganizationNameError(false);
    }

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
          username,
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

              const response = await completeAccountSignup({
                email: username,
                password,
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

              const userOrgs = await fetchOrganizations();
              const orgId = userOrgs[0]?.id;

              await selectOrganization({
                organizationId: orgId
              });

              // only create example project if not joining existing org
              if (!providerOrganizationName) {
                const project = await ProjectService.initProject({
                  projectName: "Example Project"
                });

                localStorage.setItem("projectData.id", project.id);
              }

              localStorage.setItem("orgData.id", orgId);

              setStep(2);
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

  useEffect(() => {
    if (password && providerOrganizationName) {
      signupErrorCheck();
    }
  }, [providerOrganizationName, password]);

  return (
    <div className="mx-auto mb-36 h-full w-max rounded-xl md:mb-16 md:px-8">
      <p className="text-medium mx-8 mb-6 flex justify-center bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-xl font-bold text-transparent md:mx-16">
        {t("signup.step3-message")}
      </p>
      <div className="mx-auto mb-36 h-full w-max rounded-xl py-6 md:mb-16 md:border md:border-mineshaft-600 md:bg-mineshaft-800 md:px-8">
        <div className="relative z-0 flex w-1/4 w-full min-w-[20rem] flex-col items-center justify-end rounded-lg py-2 lg:w-1/6">
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
        {providerOrganizationName === undefined && (
          <div className="relative z-0 flex w-1/4 w-full min-w-[20rem] flex-col items-center justify-end rounded-lg py-2 lg:w-1/6">
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
              disabled
            />
            {organizationNameError && (
              <p className="mt-1 ml-1 w-full text-left text-xs text-red-600">
                Please, specify your organization name
              </p>
            )}
          </div>
        )}
        {providerOrganizationName === undefined && (
          <div className="relative z-0 flex w-1/4 w-full min-w-[20rem] flex-col items-center justify-end rounded-lg py-2 lg:w-1/6">
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
        <div className="mx-auto mt-2 flex w-1/4 min-w-[20rem] max-w-xs flex-col items-center justify-center text-center text-sm md:max-w-md md:text-left lg:w-[19%]">
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
