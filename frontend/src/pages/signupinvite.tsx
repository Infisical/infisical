/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-unused-vars */
import crypto from "crypto";

import { useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faWarning, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import jsrp from "jsrp";
import queryString from "query-string";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";

import Button from "@app/components/basic/buttons/Button";
import InputField from "@app/components/basic/InputField";
import checkPassword from "@app/components/utilities/checks/checkPassword";
import Aes256Gcm from "@app/components/utilities/cryptography/aes-256-gcm";
import { deriveArgonKey } from "@app/components/utilities/cryptography/crypto";
import issueBackupKey from "@app/components/utilities/cryptography/issueBackupKey";
import { saveTokenToLocalStorage } from "@app/components/utilities/saveTokenToLocalStorage";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  useGetCommonPasswords
} from "@app/hooks/api";
import {
  completeAccountSignupInvite,
  verifySignupInvite
} from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";

// eslint-disable-next-line new-cap
const client = new jsrp.client();

type Errors = {
  length?: string,
  upperCase?: string,
  lowerCase?: string,
  number?: string,
  specialChar?: string,
  repeatedChar?: string,
};

export default function SignupInvite() {
  const { data: commonPasswords } = useGetCommonPasswords();

  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firstNameError, setFirstNameError] = useState(false);
  const [lastNameError, setLastNameError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [backupKeyError, setBackupKeyError] = useState(false);
  const [backupKeyIssued, setBackupKeyIssued] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const router = useRouter();
  const parsedUrl = queryString.parse(router.asPath.split("?")[1]);
  const token = parsedUrl.token as string;
  const organizationId = parsedUrl.organization_id as string;
  const email = (parsedUrl.to as string)?.replace(" ", "+").trim();

  // Verifies if the information that the users entered (name, workspace) is there, and if the password matched the criteria.
  const signupErrorCheck = async () => {
    setIsLoading(true);
    let errorCheck = false;
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
          client.createVerifier(async (err, result) => {
            try {
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
              
              const {
                token: jwtToken
              } = await completeAccountSignupInvite({
                email,
                firstName,
                lastName,
                protectedKey,
                protectedKeyIV,
                protectedKeyTag,
                publicKey,
                encryptedPrivateKey,
                encryptedPrivateKeyIV,
                encryptedPrivateKeyTag,
                salt: result.salt,
                verifier: result.verifier
              });
              
              // unset temporary signup JWT token and set JWT token
              SecurityClient.setSignupToken("");
              SecurityClient.setToken(jwtToken);

              saveTokenToLocalStorage({
                  publicKey,
                  encryptedPrivateKey,
                  iv: encryptedPrivateKeyIV,
                  tag: encryptedPrivateKeyTag,
                  privateKey
              });

              const userOrgs = await fetchOrganizations(); 

              const orgId = userOrgs[0]._id;
              localStorage.setItem("orgData.id", orgId);

              setStep(3);
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

  // Step 4 of the sign up process (download the emergency kit pdf)
  const stepConfirmEmail = (
    <div className="border border-mineshaft-600 bg-mineshaft-800 flex flex-col items-center w-full max-w-xs md:max-w-lg h-7/12 py-8 px-4 md:px-6 mx-1 mb-36 md:mb-16 rounded-xl drop-shadow-xl">
      <p className="text-4xl text-center font-semibold mb-6 flex justify-center text-primary-100">
        Confirm your email
      </p>
      <Image src="/images/dragon-signupinvite.svg" height={262} width={410} alt="verify email" />
      <div className="flex flex-col items-center justify-center md:p-2 max-h-24 max-w-md mx-auto text-lg px-4 mt-10 mb-2">
        <Button
          text="Confirm Email"
          onButtonPressed={async () => {
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
                } else {
                  // user will be redirected to dashboard
                  // if not logged in gets kicked out to login
                  router.push(`/org/${organizationId}/overview`);
                }
              }
            } catch (err) {
              console.error(err);
              router.push("/requestnewinvite");
            }
          }}
          size="lg"
        />
      </div>
    </div>
  );

  // Because this is the invite signup - we directly go to the last step of signup (email is already verified)
  const main = (
    <div className="border border-mineshaft-600 bg-mineshaft-800 w-max mx-auto h-7/12 py-10 px-8 rounded-xl drop-shadow-xl mb-32 md:mb-16">
      <p className="text-4xl font-bold flex justify-center mb-6 mx-8 md:mx-16 text-transparent bg-clip-text bg-gradient-to-tr from-mineshaft-300 to-white">
        Almost there!
      </p>
      <div className="relative z-0 flex items-center justify-end w-full md:p-2 rounded-lg max-h-24">
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
      <div className="flex items-center justify-center w-full md:p-2 rounded-lg max-h-24">
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
      <div className="mt-2 flex flex-col items-center justify-center w-full md:p-2 rounded-lg max-h-60">
        <InputField
          label="Password"
          onChangeHandler={(pass) => {
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
              <div className="mb-2 text-sm text-gray-400">Password should contain at least:</div> 
              {Object.keys(errors).map((key) => {
                if (errors[key as keyof Errors]) {
                  return (
                    <div className="ml-1 flex flex-row items-top justify-start" key={key}>
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
      <div className="flex flex-col items-center justify-center md:px-4 md:py-5 mt-2 px-2 py-3 max-h-24 max-w-max mx-auto text-lg">
        <Button
          text="Sign Up"
          onButtonPressed={() => {
            signupErrorCheck();
          }}
          loading={isLoading}
          size="lg"
        />
      </div>
    </div>
  );

  // Step 4 of the sign up process (download the emergency kit pdf)
  const step4 = (
    <div className="border border-mineshaft-600 bg-mineshaft-800 flex flex-col items-center w-full max-w-xs md:max-w-lg h-7/12 pt-8 pb-6 px-4 md:px-6 mx-1 mb-36 md:mb-16 rounded-xl drop-shadow-xl">
      <p className="text-4xl text-center font-semibold flex justify-center text-transparent bg-clip-text bg-gradient-to-br from-white to-mineshaft-300">
        Save your Emergency Kit
      </p>
      <div className="flex flex-col items-center justify-center w-full mt-4 md:mt-8 max-w-md text-gray-400 text-md rounded-md px-2">
        <div>
          If you get locked out of your account, your Emergency Kit is the only way to sign in.
        </div>
        <div className="mt-3">We recommend you download it and keep it somewhere safe.</div>
      </div>
      <div className="w-full p-2 flex flex-row items-center bg-white/10 text-gray-400 rounded-md max-w-xs md:max-w-md mx-auto mt-4">
        <FontAwesomeIcon icon={faWarning} className="ml-2 mr-4 text-4xl" />
        It contains your Secret Key which we cannot access or recover for you if you lose it.
      </div>
      <div className="flex flex-col items-center justify-center md:px-4 md:py-5 mt-4 px-2 py-3 max-h-24 max-w-max mx-auto text-lg">
        <Button
          text="Download PDF"
          onButtonPressed={async () => {
            await issueBackupKey({
              email,
              password,
              personalName: `${firstName} ${lastName}`,
              setBackupKeyError,
              setBackupKeyIssued
            });
            router.push(`/org/${organizationId}/overview`);
          }}
          size="lg"
        />
      </div>
    </div>
  );

  return (
    <div className="bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 h-screen flex flex-col items-center justify-center">
      <Head>
        <title>Sign Up</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Link href="/">
        <div className="mb-4 mt-20 flex justify-center">
          <Image src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical Logo" />
        </div>
      </Link>
      {step === 1 ? stepConfirmEmail : step === 2 ? main : step4}
    </div>
  );
}
