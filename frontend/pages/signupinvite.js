import React, { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { faCheck, faWarning, faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from '~/components/basic/buttons/Button';
import InputField from '~/components/basic/InputField';
import Aes256Gcm from '~/components/utilities/cryptography/aes-256-gcm';
import issueBackupKey from '~/components/utilities/cryptography/issueBackupKey';
import attemptLogin from '~/utilities/attemptLogin';
import passwordCheck from '~/utilities/checks/PasswordCheck';

import completeAccountInformationSignupInvite from './api/auth/CompleteAccountInformationSignupInvite';
import verifySignupInvite from './api/auth/VerifySignupInvite';

const nacl = require('tweetnacl');
const jsrp = require('jsrp');
nacl.util = require('tweetnacl-util');
const client = new jsrp.client();
const queryString = require('query-string');

export default function SignupInvite() {
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstNameError, setFirstNameError] = useState(false);
  const [lastNameError, setLastNameError] = useState(false);
  const [passwordErrorLength, setPasswordErrorLength] = useState(false);
  const [passwordErrorNumber, setPasswordErrorNumber] = useState(false);
  const [passwordErrorLowerCase, setPasswordErrorLowerCase] = useState(false);
  const router = useRouter();
  const parsedUrl = queryString.parse(router.asPath.split('?')[1]);
  const [email, setEmail] = useState(parsedUrl.to?.replace(' ', '+').trim());
  const token = parsedUrl.token;
  const [errorLogin, setErrorLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [backupKeyError, setBackupKeyError] = useState(false);
  const [verificationToken, setVerificationToken] = useState();
  const [backupKeyIssued, setBackupKeyIssued] = useState(false);

  // Verifies if the information that the users entered (name, workspace) is there, and if the password matched the criteria.
  const signupErrorCheck = async () => {
    setIsLoading(true);
    var errorCheck = false;
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
    errorCheck = passwordCheck(
      password,
      setPasswordErrorLength,
      setPasswordErrorNumber,
      setPasswordErrorLowerCase,
      errorCheck
    );

    if (!errorCheck) {
      // Generate a random pair of a public and a private key
      const pair = nacl.box.keyPair();
      const secretKeyUint8Array = pair.secretKey;
      const publicKeyUint8Array = pair.publicKey;
      const PRIVATE_KEY = nacl.util.encodeBase64(secretKeyUint8Array);
      const PUBLIC_KEY = nacl.util.encodeBase64(publicKeyUint8Array);

      const { ciphertext, iv, tag } = Aes256Gcm.encrypt({
        text: PRIVATE_KEY,
        secret: password
          .slice(0, 32)
          .padStart(
            32 + (password.slice(0, 32).length - new Blob([password]).size),
            '0'
          )
      });

      localStorage.setItem('PRIVATE_KEY', PRIVATE_KEY);

      client.init(
        {
          username: email,
          password: password
        },
        async () => {
          client.createVerifier(async (err, result) => {
            let response = await completeAccountInformationSignupInvite({
              email,
              firstName,
              lastName,
              publicKey: PUBLIC_KEY,
              ciphertext,
              iv,
              tag,
              salt: result.salt,
              verifier: result.verifier,
              token: verificationToken
            });

            // if everything works, go the main dashboard page.
            if (!errorCheck && response.status == '200') {
              response = await response.json();

              localStorage.setItem('publicKey', PUBLIC_KEY);
              localStorage.setItem('encryptedPrivateKey', ciphertext);
              localStorage.setItem('iv', iv);
              localStorage.setItem('tag', tag);

              try {
                await attemptLogin(
                  email,
                  password,
                  setErrorLogin,
                  router,
                  false,
                  false
                );
                setStep(3);
              } catch (error) {
                setIsLoading(false);
                console.log('Error', error);
              }
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
    <div className="bg-bunker flex flex-col items-center w-full max-w-xs md:max-w-lg mx-auto h-7/12 py-8 px-4 md:px-6 mx-1 mb-36 md:mb-16 rounded-xl drop-shadow-xl">
      <p className="text-4xl text-center font-semibold mb-8 flex justify-center text-transparent bg-clip-text bg-gradient-to-br from-sky-400 to-primary">
        Confirm your email
      </p>
      <Image
        src="/images/envelope.svg"
        height={262}
        width={410}
        alt="verify email"
      ></Image>
      <div className="flex max-w-max flex-col items-center justify-center md:p-2 max-h-24 max-w-md mx-auto text-lg px-4 mt-4 mb-2">
        <Button
          text="Confirm Email"
          onButtonPressed={async () => {
            const response = await verifySignupInvite({
              email,
              code: token
            });
            if (response.status == 200) {
              setVerificationToken((await response.json()).token);
              setStep(2);
            } else {
              console.log('ERROR', response);
              router.push('/requestnewinvite');
            }
          }}
          size="lg"
        />
      </div>
    </div>
  );

  // Because this is the invite signup - we directly go to the last step of signup (email is already verified)
  const main = (
    <div className="bg-bunker w-max mx-auto h-7/12 py-10 px-8 rounded-xl drop-shadow-xl mb-32 md:mb-16">
      <p className="text-4xl font-bold flex justify-center mb-6 text-gray-400 mx-8 md:mx-16 text-transparent bg-clip-text bg-gradient-to-br from-sky-400 to-primary">
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
          onChangeHandler={(password) => {
            setPassword(password);
            passwordCheck({
              password,
              setPasswordErrorLength,
              setPasswordErrorNumber,
              setPasswordErrorLowerCase,
              currentErrorCheck: false
            });
          }}
          type="password"
          value={password}
          isRequired
          error={
            passwordErrorLength && passwordErrorNumber && passwordErrorLowerCase
          }
          autoComplete="new-password"
          id="new-password"
        />
        {passwordErrorLength ||
        passwordErrorLowerCase ||
        passwordErrorNumber ? (
          <div className="w-full mt-4 bg-white/5 px-2 flex flex-col items-start py-2 rounded-md">
            <div className={`text-gray-400 text-sm mb-1`}>
              Password should contain at least:
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
                  passwordErrorLength ? 'text-gray-400' : 'text-gray-600'
                } text-sm`}
              >
                14 characters
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
                  passwordErrorLowerCase ? 'text-gray-400' : 'text-gray-600'
                } text-sm`}
              >
                1 lowercase character
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
                  passwordErrorNumber ? 'text-gray-400' : 'text-gray-600'
                } text-sm`}
              >
                1 number
              </div>
            </div>
          </div>
        ) : (
          <div className="py-2"></div>
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
    <div className="bg-bunker flex flex-col items-center w-full max-w-xs md:max-w-lg mx-auto h-7/12 py-8 px-4 md:px-6 mx-1 mb-36 md:mb-16 rounded-xl drop-shadow-xl">
      <p className="text-4xl text-center font-semibold flex justify-center text-transparent bg-clip-text bg-gradient-to-br from-sky-400 to-primary">
        Save your Emergency Kit
      </p>
      <div className="flex flex-col items-center justify-center w-full mt-4 md:mt-8 max-w-md text-gray-400 text-md rounded-md px-2">
        <div>
          If you get locked out of your account, your Emergency Kit is the only
          way to sign in.
        </div>
        <div className="mt-3">
          We recommend you download it and keep it somewhere safe.
        </div>
      </div>
      <div className="w-full p-2 flex flex-row items-center bg-white/10 text-gray-400 rounded-md max-w-xs md:max-w-md mx-auto mt-4">
        <FontAwesomeIcon icon={faWarning} className="ml-2 mr-4 text-4xl" />
        It contains your Secret Key which we cannot access or recover for you if
        you lose it.
      </div>
      <div className="flex flex-row items-center justify-center w-3/4 md:w-full md:p-2 max-h-28 max-w-xs md:max-w-md mx-auto mt-6 md:mt-8 py-1 text-lg text-center md:text-left">
        <Button
          text="Download PDF"
          onButtonPressed={async () => {
            await issueBackupKey({
              email,
              password,
              personalName: firstName + ' ' + lastName,
              setBackupKeyError,
              setBackupKeyIssued
            });
            router.push('/dashboard/');
          }}
          size="lg"
        />
        {/* <div
					className="text-l mt-4 text-lg text-gray-400 hover:text-gray-300 duration-200 bg-white/5 px-8 hover:bg-white/10 py-3 rounded-md cursor-pointer"
					onClick={() => {
						if (localStorage.getItem("projectData.id")) {
							router.push("/dashboard/" + localStorage.getItem("projectData.id"));
						} else {
							router.push("/noprojects")
						}
					}}
				>
					Later
				</div> */}
      </div>
    </div>
  );

  return (
    <div className="bg-bunker-800 h-full flex flex-col items-center justify-center">
      <Head>
        <title>Sign Up</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Link href="/">
        <div className="flex justify-center mb-2 md:mb-4 opacity-80 cursor-pointer">
          <Image
            src="/images/biglogo.png"
            height={90}
            width={120}
            alt="Infisical Wide Logo"
          />
        </div>
      </Link>
      {step == 1 ? stepConfirmEmail : step == 2 ? main : step4}
    </div>
  );
}
