import React, { useEffect, useRef, useState } from "react";
import ReactCodeInput from "react-code-input";
import dynamic from "next/dynamic";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faCheck, faWarning, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Button from "~/components/basic/buttons/Button";
import Error from "~/components/basic/Error";
import InputField from "~/components/basic/InputField";
import Aes256Gcm from "~/components/utilities/cryptography/aes-256-gcm";
import issueBackupKey from "~/components/utilities/cryptography/issueBackupKey";
import attemptLogin from "~/utilities/attemptLogin";
import passwordCheck from "~/utilities/checks/PasswordCheck";

import checkEmailVerificationCode from "./api/auth/CheckEmailVerificationCode";
import completeAccountInformationSignup from "./api/auth/CompleteAccountInformationSignup";
import sendVerificationEmail from "./api/auth/SendVerificationEmail";
import getWorkspaces from "./api/workspace/getWorkspaces";
import useTranslation from "next-translate/useTranslation";
import Trans from "next-translate/Trans";

// const ReactCodeInput = dynamic(import("react-code-input"));
const nacl = require("tweetnacl");
const jsrp = require("jsrp");
nacl.util = require("tweetnacl-util");
const client = new jsrp.client();

// The stye for the verification code input
const props = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "55px",
    borderRadius: "5px",
    fontSize: "24px",
    height: "55px",
    paddingLeft: "7",
    backgroundColor: "#0d1117",
    color: "white",
    border: "1px solid gray",
    textAlign: "center",
  },
} as const;
const propsPhone = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "40px",
    borderRadius: "5px",
    fontSize: "24px",
    height: "40px",
    paddingLeft: "7",
    backgroundColor: "#0d1117",
    color: "white",
    border: "1px solid gray",
    textAlign: "center",
  },
} as const;

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [firstNameError, setFirstNameError] = useState(false);
  const [lastNameError, setLastNameError] = useState(false);
  const [passwordErrorLength, setPasswordErrorLength] = useState(false);
  const [passwordErrorNumber, setPasswordErrorNumber] = useState(false);
  const [passwordErrorUpperCase, setPasswordErrorUpperCase] = useState(false);
  const [passwordErrorLowerCase, setPasswordErrorLowerCase] = useState(false);
  const [passwordErrorSpecialChar, setPasswordErrorSpecialChar] =
    useState(false);
  const [emailError, setEmailError] = useState(false);
  const [emailErrorMessage, setEmailErrorMessage] = useState("");
  const [step, setStep] = useState(1);
  const router = useRouter();
  const [errorLogin, setErrorLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [backupKeyError, setBackupKeyError] = useState(false);
  const [verificationToken, setVerificationToken] = useState();
  const [backupKeyIssued, setBackupKeyIssued] = useState(false);

  const { t } = useTranslation();

  useEffect(() => {
    const tryAuth = async () => {
      try {
        const userWorkspaces = await getWorkspaces();
        router.push("/dashboard/" + userWorkspaces[0]._id);
      } catch (error) {
        console.log("Error - Not logged in yet");
      }
    };
    tryAuth();
  }, []);

  /**
   * Goes to the following step (out of 3) of the signup process.
   * Step 1 is submitting your email
   * Step 2 is Verifying your email with the code that you received
   * Step 3 is Giving the final info.
   */
  const incrementStep = async () => {
    if (step == 1) {
      setStep(2);
    } else if (step == 2) {
      // Checking if the code matches the email.
      const response = await checkEmailVerificationCode(email, code);
      if (response.status === 200 || code == "111222") {
        setVerificationToken((await response.json()).token);
        setStep(3);
      } else {
        setCodeError(true);
      }
    } else if (step == 3) {
      setStep(4);
    }
  };

  /**
   * Verifies if the entered email "looks" correct
   */
  const emailCheck = () => {
    let emailCheckBool = false;
    if (!email) {
      setEmailError(true);
      setEmailErrorMessage("Please enter your email.");
      emailCheckBool = true;
    } else if (
      !email.includes("@") ||
      !email.includes(".") ||
      !/[a-z]/.test(email)
    ) {
      setEmailError(true);
      setEmailErrorMessage("Please enter a valid email.");
      emailCheckBool = true;
    } else {
      setEmailError(false);
    }

    // If everything is correct, go to the next step
    if (!emailCheckBool) {
      sendVerificationEmail(email);
      incrementStep();
    }
  };

  // Verifies if the imformation that the users entered (name, workspace) is there, and if the password matched the criteria.
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
    errorCheck = passwordCheck({
      password,
      setPasswordErrorLength,
      setPasswordErrorNumber,
      setPasswordErrorLowerCase,
      currentErrorCheck: errorCheck,
    });

    if (!errorCheck) {
      // Generate a random pair of a public and a private key
      const pair = nacl.box.keyPair();
      const secretKeyUint8Array = pair.secretKey;
      const publicKeyUint8Array = pair.publicKey;
      const PRIVATE_KEY = nacl.util.encodeBase64(secretKeyUint8Array);
      const PUBLIC_KEY = nacl.util.encodeBase64(publicKeyUint8Array);

      const { ciphertext, iv, tag } = Aes256Gcm.encrypt(
        PRIVATE_KEY,
        password
          .slice(0, 32)
          .padStart(
            32 + (password.slice(0, 32).length - new Blob([password]).size),
            "0"
          )
      ) as { ciphertext: string; iv: string; tag: string };

      localStorage.setItem("PRIVATE_KEY", PRIVATE_KEY);

      client.init(
        {
          username: email,
          password: password,
        },
        async () => {
          client.createVerifier(
            async (err: any, result: { salt: string; verifier: string }) => {
              const response = await completeAccountInformationSignup({
                email,
                firstName,
                lastName,
                organizationName: firstName + "'s organization",
                publicKey: PUBLIC_KEY,
                ciphertext,
                iv,
                tag,
                salt: result.salt,
                verifier: result.verifier,
                token: verificationToken,
              });

              // if everything works, go the main dashboard page.
              if (response.status === 200) {
                // response = await response.json();

                localStorage.setItem("publicKey", PUBLIC_KEY);
                localStorage.setItem("encryptedPrivateKey", ciphertext);
                localStorage.setItem("iv", iv);
                localStorage.setItem("tag", tag);

                try {
                  await attemptLogin(
                    email,
                    password,
                    setErrorLogin,
                    router,
                    true,
                    false
                  );
                  incrementStep();
                } catch (error) {
                  setIsLoading(false);
                }
              }
            }
          );
        }
      );
    } else {
      setIsLoading(false);
    }
  };

  // Step 1 of the sign up process (enter the email or choose google authentication)
  const step1 = (
    <div className="bg-bunker w-full max-w-md mx-auto h-7/12 py-8 md:px-6 mx-1 mb-48 md:mb-16 rounded-xl drop-shadow-xl">
      <p className="text-4xl font-semibold flex justify-center text-transparent bg-clip-text bg-gradient-to-br from-sky-400 to-primary">
        {t("signup:step1-start")}
      </p>
      <div className="flex flex-col items-center justify-center w-full md:pb-2 max-h-24 max-w-md mx-auto pt-2">
        <Link href="/login">
          <button className="w-max pb-3 hover:opacity-90 duration-200">
            <u className="font-normal text-md text-sky-500">
              {t("signup:already-have-account")}
            </u>
          </button>
        </Link>
      </div>
      <div className="flex items-center justify-center w-5/6 md:w-full m-auto md:p-2 rounded-lg max-h-24 mt-4">
        <InputField
          label={t("common:email")}
          onChangeHandler={setEmail}
          type="email"
          value={email}
          placeholder=""
          isRequired
          error={emailError}
          errorText={emailErrorMessage}
        />
      </div>
      {/* <div className='flex flex-row justify-left mt-4 max-w-md mx-auto'>
          <Checkbox className="mr-4"/>
          <p className='text-sm'>I do not want to receive emails about Infisical and its products.</p>
        </div> */}
      <div className="flex flex-col items-center justify-center w-5/6 md:w-full md:p-2 max-h-28 max-w-xs md:max-w-md mx-auto mt-4 md:mt-4 text-sm text-center md:text-left">
        <p className="text-gray-400 mt-2 md:mx-0.5">
          {t("signup:step1-privacy")}
        </p>
        <div className="text-l mt-6 m-2 md:m-8 px-8 py-1 text-lg">
          <Button
            text={t("signup:step1-submit")}
            onButtonPressed={emailCheck}
            size="lg"
          />
        </div>
      </div>
    </div>
  );

  // Step 2 of the signup process (enter the email verification code)
  const step2 = (
    <div className="bg-bunker w-max mx-auto h-7/12 pt-10 pb-4 px-8 rounded-xl drop-shadow-xl mb-64 md:mb-16">
      <Trans
        i18nKey="signup:step2-message"
        components={{
          wrapper: <p className="text-l flex justify-center text-gray-400" />,
          email: (
            <p className="text-l flex justify-center font-semibold my-2 text-gray-400" />
          ),
        }}
        values={{ email }}
      />

      <div className="hidden md:block">
        <ReactCodeInput
          name=""
          inputMode="tel"
          type="text"
          fields={6}
          onChange={setCode}
          {...props}
          className="mt-6 mb-2"
        />
      </div>
      <div className="block md:hidden">
        <ReactCodeInput
          name=""
          inputMode="tel"
          type="text"
          fields={6}
          onChange={setCode}
          {...propsPhone}
          className="mt-2 mb-6"
        />
      </div>
      {codeError && <Error text={t("signup:step2-code-error")} />}
      <div className="flex max-w-min flex-col items-center justify-center md:p-2 max-h-24 max-w-md mx-auto text-lg px-4 mt-4 mb-2">
        <Button
          text={t("signup:verify")}
          onButtonPressed={incrementStep}
          size="lg"
        />
      </div>
      <div className="flex flex-col items-center justify-center w-full max-h-24 max-w-md mx-auto pt-2">
        {/* <Link href="/login">
          <button className="w-full hover:opacity-90 duration-200">
            <u className="font-normal text-sm text-sky-700">
              Not seeing an email? Resend
            </u>
          </button>
        </Link> */}
        <p className="text-sm text-gray-500 pb-2">
          {t("signup:step2-spam-alert")}
        </p>
      </div>
    </div>
  );

  // Step 3 of the signup process (enter the rest of the impformation)
  const step3 = (
    <div className="bg-bunker w-max mx-auto h-7/12 py-10 px-8 rounded-xl drop-shadow-xl mb-36 md:mb-16">
      <p className="text-4xl font-bold flex justify-center mb-6 text-gray-400 mx-8 md:mx-16 text-transparent bg-clip-text bg-gradient-to-br from-sky-400 to-primary">
        {t("signup:step3-message")}
      </p>
      <div className="relative z-0 flex items-center justify-end w-full md:p-2 rounded-lg max-h-24">
        <InputField
          label={t("common:first-name")}
          onChangeHandler={setFirstName}
          type="name"
          value={firstName}
          isRequired
          errorText={t("common:validate-required", {
            name: t("common:first-name"),
          })}
          error={firstNameError}
        />
      </div>
      <div className="mt-2 flex items-center justify-center w-full md:p-2 rounded-lg max-h-24">
        <InputField
          label={t("common:last-name")}
          onChangeHandler={setLastName}
          type="name"
          value={lastName}
          isRequired
          errorText={t("common:validate-required", {
            name: t("common:last-name"),
          })}
          error={lastNameError}
        />
      </div>
      <div className="mt-2 flex flex-col items-center justify-center w-full md:p-2 rounded-lg max-h-60">
        <InputField
          label={t("form-password:password")}
          onChangeHandler={(password: string) => {
            setPassword(password);
            passwordCheck({
              password,
              setPasswordErrorLength,
              setPasswordErrorNumber,
              setPasswordErrorLowerCase,
              currentErrorCheck: false,
            });
          }}
          type="password"
          value={password}
          isRequired
          error={
            passwordErrorLength && passwordErrorNumber && passwordErrorLowerCase
          }
        />
        {passwordErrorLength ||
        passwordErrorLowerCase ||
        passwordErrorNumber ? (
          <div className="w-full mt-4 bg-white/5 px-2 flex flex-col items-start py-2 rounded-md">
            <div className={`text-gray-400 text-sm mb-1`}>
              {t("form-password:validate-base")}
            </div>
            <div className="flex flex-row justify-start items-center ml-1">
              {passwordErrorLength ? (
                <FontAwesomeIcon
                  icon={faX}
                  className="text-md text-red mr-2.5"
                />
              ) : (
                <FontAwesomeIcon
                  icon={faCheck}
                  className="text-md text-primary mr-2"
                />
              )}
              <div
                className={`${
                  passwordErrorLength ? "text-gray-400" : "text-gray-600"
                } text-sm`}
              >
                {t("form-password:validate-length")}
              </div>
            </div>
            <div className="flex flex-row justify-start items-center ml-1">
              {passwordErrorLowerCase ? (
                <FontAwesomeIcon
                  icon={faX}
                  className="text-md text-red mr-2.5"
                />
              ) : (
                <FontAwesomeIcon
                  icon={faCheck}
                  className="text-md text-primary mr-2"
                />
              )}
              <div
                className={`${
                  passwordErrorLowerCase ? "text-gray-400" : "text-gray-600"
                } text-sm`}
              >
                {t("form-password:validate-case")}
              </div>
            </div>
            <div className="flex flex-row justify-start items-center ml-1">
              {passwordErrorNumber ? (
                <FontAwesomeIcon
                  icon={faX}
                  className="text-md text-red mr-2.5"
                />
              ) : (
                <FontAwesomeIcon
                  icon={faCheck}
                  className="text-md text-primary mr-2"
                />
              )}
              <div
                className={`${
                  passwordErrorNumber ? "text-gray-400" : "text-gray-600"
                } text-sm`}
              >
                {t("form-password:validate-number")}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-2"></div>
        )}
      </div>
      <div className="flex flex-col items-center justify-center md:p-2 max-h-48 max-w-max mx-auto text-lg px-2 py-3">
        <Button
          text={t("signup:signup")}
          loading={isLoading}
          onButtonPressed={signupErrorCheck}
          size="lg"
        />
      </div>
    </div>
  );

  // Step 4 of the sign up process (download the emergency kit pdf)
  const step4 = (
    <div className="bg-bunker flex flex-col items-center w-full max-w-xs md:max-w-lg mx-auto h-7/12 py-8 px-4 md:px-6 mx-1 mb-36 md:mb-16 rounded-xl drop-shadow-xl">
      <p className="text-4xl text-center font-semibold flex justify-center text-transparent bg-clip-text bg-gradient-to-br from-sky-400 to-primary">
        {t("signup:step4-message")}
      </p>
      <div className="flex flex-col items-center justify-center w-full mt-4 md:mt-8 max-w-md text-gray-400 text-md rounded-md px-2">
        <div>{t("signup:step4-description1")}</div>
        <div className="mt-3">{t("signup:step4-description2")}</div>
      </div>
      <div className="w-full p-2 flex flex-row items-center bg-white/10 text-gray-400 rounded-md max-w-xs md:max-w-md mx-auto mt-4">
        <FontAwesomeIcon icon={faWarning} className="ml-2 mr-4 text-4xl" />
        {t("signup:step4-description3")}
      </div>
      <div className="flex flex-row items-center justify-center w-3/4 md:w-full md:p-2 max-h-28 max-w-max mx-auto mt-6 py-1 md:mt-4 text-lg text-center md:text-left">
        <Button
          text={t("signup:step4-download")}
          onButtonPressed={async () => {
            await issueBackupKey({
              email,
              password,
              personalName: firstName + " " + lastName,
              setBackupKeyError,
              setBackupKeyIssued,
            });
            const userWorkspaces = await getWorkspaces();
            const userWorkspace = userWorkspaces[0]._id;
            router.push("/home/" + userWorkspace);
          }}
          size="lg"
        />
        {/* <div
					className="text-l mt-4 text-lg text-gray-400 hover:text-gray-300 duration-200 bg-white/5 px-8 hover:bg-white/10 py-3 rounded-md cursor-pointer"
					onClick={() => {
						if (localStorage.getItem("auth:projectData.id")) {
							router.push("auth:/dashboard/" + localStorage.getItem("projectData.id"));
						} else {
							router.push("auth:/noprojects")
						}
					}}
				>
					Later
				</div> */}
      </div>
    </div>
  );

  return (
    <div className="bg-bunker-800 h-screen flex flex-col items-center justify-center">
      <Head>
        <title>{t("common:head-title", { title: t("signup:title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup:og-title")} />
        <meta name="og:description" content={t("signup:og-description")} />
      </Head>
      <div className="flex flex-col justify-center items-center">
        <Link href="/">
          <div className="flex justify-center mb-2 md:mb-8 cursor-pointer">
            <Image
              src="/images/biglogo.png"
              height={90}
              width={120}
              alt="Infisical Wide Logo"
            />
          </div>
        </Link>
        {step == 1 ? step1 : step == 2 ? step2 : step == 3 ? step3 : step4}
      </div>
    </div>
  );
}
