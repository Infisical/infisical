/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-unused-vars */
import crypto from 'crypto';

import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { faCheck, faWarning, faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import jsrp from 'jsrp';
import queryString from 'query-string';
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';

import Button from '@app/components/basic/buttons/Button';
import InputField from '@app/components/basic/InputField';
import attemptLogin from '@app/components/utilities/attemptLogin';
import passwordCheck from '@app/components/utilities/checks/PasswordCheck';
import Aes256Gcm from '@app/components/utilities/cryptography/aes-256-gcm';
import { deriveArgonKey } from '@app/components/utilities/cryptography/crypto';
import issueBackupKey from '@app/components/utilities/cryptography/issueBackupKey';
import { saveTokenToLocalStorage } from '@app/components/utilities/saveTokenToLocalStorage';
import SecurityClient from '@app/components/utilities/SecurityClient';
import getOrganizations from '@app/pages/api/organization/getOrgs';
import getOrganizationUserProjects from '@app/pages/api/organization/GetOrgUserProjects';

import completeAccountInformationSignupInvite from './api/auth/CompleteAccountInformationSignupInvite';
import verifySignupInvite from './api/auth/VerifySignupInvite';

// eslint-disable-next-line new-cap
const client = new jsrp.client();

export default function SignupInvite() {
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstNameError, setFirstNameError] = useState(false);
  const [lastNameError, setLastNameError] = useState(false);
  const [passwordErrorLength, setPasswordErrorLength] = useState(false);
  const [passwordErrorNumber, setPasswordErrorNumber] = useState(false);
  const [passwordErrorLowerCase, setPasswordErrorLowerCase] = useState(false);
  const [errorLogin, setErrorLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [backupKeyError, setBackupKeyError] = useState(false);
  const [verificationToken, setVerificationToken] = useState('');
  const [backupKeyIssued, setBackupKeyIssued] = useState(false);

  const router = useRouter();
  const parsedUrl = queryString.parse(router.asPath.split('?')[1]);
  const token = parsedUrl.token as string;
  const email = (parsedUrl.to as string)?.replace(' ', '+').trim();

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
    errorCheck = passwordCheck({
      password,
      setPasswordErrorLength,
      setPasswordErrorNumber,
      setPasswordErrorLowerCase,
      errorCheck
    });

    if (!errorCheck) {
      // Generate a random pair of a public and a private key
      const pair = nacl.box.keyPair();
      const secretKeyUint8Array = pair.secretKey;
      const publicKeyUint8Array = pair.publicKey;
      const privateKey = encodeBase64(secretKeyUint8Array);
      const publicKey = encodeBase64(publicKeyUint8Array);

      localStorage.setItem('PRIVATE_KEY', privateKey);

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

              if (!derivedKey) throw new Error('Failed to derive key from password');

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
                text: key.toString('hex'),
                secret: Buffer.from(derivedKey.hash)
              });
              
              const {
                token: jwtToken
              } = await completeAccountInformationSignupInvite({
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
              SecurityClient.setSignupToken('');
              SecurityClient.setToken(jwtToken);

              saveTokenToLocalStorage({
                  protectedKey,
                  protectedKeyIV,
                  protectedKeyTag,
                  publicKey,
                  encryptedPrivateKey,
                  iv: encryptedPrivateKeyIV,
                  tag: encryptedPrivateKeyTag,
                  privateKey
              });

              const userOrgs = await getOrganizations(); 

              const orgId = userOrgs[0]._id;
              localStorage.setItem('orgData.id', orgId);

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
    <div className="bg-bunker flex flex-col items-center w-full max-w-xs md:max-w-lg h-7/12 py-8 px-4 md:px-6 mx-1 mb-36 md:mb-16 rounded-xl drop-shadow-xl">
      <p className="text-4xl text-center font-semibold mb-6 flex justify-center text-primary-100">
        Confirm your email
      </p>
      <Image src="/images/dragon-signupinvite.svg" height={262} width={410} alt="verify email" />
      <div className="flex flex-col items-center justify-center md:p-2 max-h-24 max-w-md mx-auto text-lg px-4 mt-10 mb-2">
        <Button
          text="Confirm Email"
          onButtonPressed={async () => {
            const response = await verifySignupInvite({
              email,
              code: token
            });
            if (response.status === 200) {
              const res = await response.json();
              // user will have temp token if doesn't have an account
              // then continue with account setup workflow
              if (res?.token) {
                SecurityClient.setSignupToken(res.token);
                setStep(2);
              } else {
                // user will be redirected to dashboard
                // if not logged in gets kicked out to login
                router.push('/dashboard');
              }
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
          onChangeHandler={(pass) => {
            setPassword(pass);
            passwordCheck({
              password: pass,
              setPasswordErrorLength,
              setPasswordErrorNumber,
              setPasswordErrorLowerCase,
              errorCheck: false
            });
          }}
          type="password"
          value={password}
          isRequired
          error={passwordErrorLength && passwordErrorNumber && passwordErrorLowerCase}
          autoComplete="new-password"
          id="new-password"
        />
        {passwordErrorLength || passwordErrorLowerCase || passwordErrorNumber ? (
          <div className="w-full mt-4 bg-white/5 px-2 flex flex-col items-start py-2 rounded-md">
            <div className="text-gray-400 text-sm mb-1">Password should contain at least:</div>
            <div className="flex flex-row justify-start items-center ml-1">
              {passwordErrorLength ? (
                <FontAwesomeIcon icon={faX} className="text-md text-red mr-2.5" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md text-primary mr-2" />
              )}
              <div className={`${passwordErrorLength ? 'text-gray-400' : 'text-gray-600'} text-sm`}>
                14 characters
              </div>
            </div>
            <div className="flex flex-row justify-start items-center ml-1">
              {passwordErrorLowerCase ? (
                <FontAwesomeIcon icon={faX} className="text-md text-red mr-2.5" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md text-primary mr-2" />
              )}
              <div
                className={`${passwordErrorLowerCase ? 'text-gray-400' : 'text-gray-600'} text-sm`}
              >
                1 lowercase character
              </div>
            </div>
            <div className="flex flex-row justify-start items-center ml-1">
              {passwordErrorNumber ? (
                <FontAwesomeIcon icon={faX} className="text-md text-red mr-2.5" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md text-primary mr-2" />
              )}
              <div className={`${passwordErrorNumber ? 'text-gray-400' : 'text-gray-600'} text-sm`}>
                1 number
              </div>
            </div>
          </div>
        ) : (
          <div className="py-2" />
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
    <div className="bg-bunker flex flex-col items-center w-full max-w-xs md:max-w-lg h-7/12 py-8 px-4 md:px-6 mx-1 mb-36 md:mb-16 rounded-xl drop-shadow-xl">
      <p className="text-4xl text-center font-semibold flex justify-center text-transparent bg-clip-text bg-gradient-to-br from-sky-400 to-primary">
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
      <div className="flex flex-col items-center justify-center md:px-4 md:py-5 mt-2 px-2 py-3 max-h-24 max-w-max mx-auto text-lg">
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
            router.push('/noprojects/');
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
    <div className="bg-bunker-800 h-screen flex flex-col items-center justify-center">
      <Head>
        <title>Sign Up</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Link href="/">
        <div className="flex justify-center mb-2 md:mb-4 opacity-80 cursor-pointer">
          <Image src="/images/biglogo.png" height={90} width={120} alt="Infisical Wide Logo" />
        </div>
      </Link>
      {step === 1 ? stepConfirmEmail : step === 2 ? main : step4}
    </div>
  );
}
