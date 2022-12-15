import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { faCheck, faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from '~/components/basic/buttons/Button';
import InputField from '~/components/basic/InputField';
import passwordCheck from '~/components/utilities/checks/PasswordCheck';
import Aes256Gcm from '~/components/utilities/cryptography/aes-256-gcm';

import EmailVerifyOnPasswordReset from './api/auth/EmailVerifyOnPasswordReset';
import getBackupEncryptedPrivateKey from './api/auth/getBackupEncryptedPrivateKey';
import resetPasswordOnAccountRecovery from './api/auth/resetPasswordOnAccountRecovery';

const queryString = require('query-string');
const nacl = require('tweetnacl');
const jsrp = require('jsrp');
nacl.util = require('tweetnacl-util');
const client = new jsrp.client();

export default function PasswordReset() {
  const router = useRouter();
  const parsedUrl = queryString.parse(router.asPath.split('?')[1]);
  const token = parsedUrl.token;
  const email = parsedUrl.to?.replace(' ', '+').trim();
  const [verificationToken, setVerificationToken] = useState('');
  const [step, setStep] = useState(1);
  const [backupKey, setBackupKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [backupKeyError, setBackupKeyError] = useState(false);
  const [passwordErrorLength, setPasswordErrorLength] = useState(false);
  const [passwordErrorNumber, setPasswordErrorNumber] = useState(false);
  const [passwordErrorLowerCase, setPasswordErrorLowerCase] = useState(false);

  // Unencrypt the private key with a backup key
  const getEncryptedKeyHandler = async () => {
    try {
      const result = await getBackupEncryptedPrivateKey({ verificationToken });
      setPrivateKey(
        Aes256Gcm.decrypt({
          ciphertext: result.encryptedPrivateKey,
          iv: result.iv,
          tag: result.tag,
          secret: backupKey
        })
      );
      setStep(3);
    } catch {
      setBackupKeyError(true);
    }
  };

  // If everything is correct, reset the password
  const resetPasswordHandler = async () => {
    let errorCheck = false;
    errorCheck = passwordCheck({
      password: newPassword,
      setPasswordErrorLength,
      setPasswordErrorNumber,
      setPasswordErrorLowerCase,
      currentErrorCheck: errorCheck
    });

    if (!errorCheck) {
      // Generate a random pair of a public and a private key
      const { ciphertext, iv, tag } = Aes256Gcm.encrypt({
        text: privateKey,
        secret: newPassword
          .slice(0, 32)
          .padStart(
            32 +
              (newPassword.slice(0, 32).length - new Blob([newPassword]).size),
            '0'
          )
      }) as { ciphertext: string; iv: string; tag: string };

      client.init(
        {
          username: email,
          password: newPassword
        },
        async () => {
          client.createVerifier(
            async (err: any, result: { salt: string; verifier: string }) => {
              const response = await resetPasswordOnAccountRecovery({
                verificationToken,
                encryptedPrivateKey: ciphertext,
                iv,
                tag,
                salt: result.salt,
                verifier: result.verifier
              });

              // if everything works, go the main dashboard page.
              if (response?.status === 200) {
                router.push('/login');
              }
            }
          );
        }
      );
    }
  };

  // Click a button to confirm email
  const stepConfirmEmail = (
    <div className="bg-bunker flex flex-col items-center w-full py-6 max-w-xs md:max-w-lg mx-auto my-32 px-4 md:px-6 mx-1 rounded-xl drop-shadow-xl">
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
            const response = await EmailVerifyOnPasswordReset({
              email,
              code: token
            });
            if (response.status == 200) {
              setVerificationToken((await response.json()).token);
              setStep(2);
            } else {
              console.log('ERROR', response);
              router.push('/email-not-verified');
            }
          }}
          size="lg"
        />
      </div>
    </div>
  );

  // Input backup key
  const stepInputBackupKey = (
    <div className="bg-bunker flex flex-col items-center w-full pt-6 pb-3 max-w-xs md:max-w-lg mx-auto my-32 px-4 md:px-6 mx-1 rounded-xl drop-shadow-xl">
      <p className="text-2xl md:text-3xl w-max mx-auto flex justify-center font-semibold text-bunker-100 mb-4">
        Enter your backup key
      </p>
      <div className="flex flex-row items-center justify-center md:pb-4 mt-4 md:mx-2">
        <p className="text-sm flex justify-center text-gray-400 w-max max-w-md">
          You can find it in your emrgency kit. You had to download the enrgency
          kit during signup.
        </p>
      </div>
      <div className="flex items-center justify-center w-full md:p-2 rounded-lg mt-4 md:mt-0 max-h-24 md:max-h-28">
        <InputField
          label="Backup Key"
          onChangeHandler={setBackupKey}
          type="password"
          value={backupKey}
          placeholder=""
          isRequired
          error={backupKeyError}
          errorText="Something is wrong with the backup key"
        />
      </div>
      <div className="flex flex-col items-center justify-center w-full md:p-2 max-h-20 max-w-md mt-4 mx-auto text-sm">
        <div className="text-l mt-6 m-8 px-8 py-3 text-lg">
          <Button
            text="Submit Backup Key"
            onButtonPressed={() => getEncryptedKeyHandler()}
            size="lg"
          />
        </div>
      </div>
    </div>
  );

  // Enter new password
  const stepEnterNewPassword = (
    <div className="bg-bunker flex flex-col items-center w-full pt-6 pb-3 max-w-xs md:max-w-lg mx-auto my-32 px-4 md:px-6 mx-1 rounded-xl drop-shadow-xl">
      <p className="text-2xl md:text-3xl w-max mx-auto flex justify-center font-semibold text-bunker-100">
        Enter new password
      </p>
      <div className="flex flex-row items-center justify-center md:pb-4 mt-1 md:mx-2">
        <p className="text-sm flex justify-center text-gray-400 w-max max-w-md">
          Make sure you save it somewhere save.
        </p>
      </div>
      <div className="flex items-center justify-center w-full md:p-2 rounded-lg mt-4 md:mt-0 max-h-24 md:max-h-28">
        <InputField
          label="New Password"
          onChangeHandler={(password) => {
            setNewPassword(password);
            passwordCheck({
              password,
              setPasswordErrorLength,
              setPasswordErrorNumber,
              setPasswordErrorLowerCase,
              currentErrorCheck: false
            });
          }}
          type="password"
          value={newPassword}
          isRequired
          error={
            passwordErrorLength && passwordErrorLowerCase && passwordErrorNumber
          }
          autoComplete="new-password"
          id="new-password"
        />
      </div>
      {passwordErrorLength || passwordErrorLowerCase || passwordErrorNumber ? (
        <div className="w-full mt-3 bg-white/5 px-2 mx-2 flex flex-col items-start py-2 rounded-md max-w-md mb-2">
          <div className={`text-gray-400 text-sm mb-1`}>
            Password should contain at least:
          </div>
          <div className="flex flex-row justify-start items-center ml-1">
            {passwordErrorLength ? (
              <FontAwesomeIcon icon={faX} className="text-md text-red mr-2.5" />
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
              <FontAwesomeIcon icon={faX} className="text-md text-red mr-2.5" />
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
              <FontAwesomeIcon icon={faX} className="text-md text-red mr-2.5" />
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
      <div className="flex flex-col items-center justify-center w-full md:p-2 max-h-20 max-w-md mt-4 mx-auto text-sm">
        <div className="text-l mt-6 m-8 px-8 py-3 text-lg">
          <Button
            text="Submit New Password"
            onButtonPressed={() => resetPasswordHandler()}
            size="lg"
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-bunker-800 h-screen w-full flex flex-col items-center justify-center">
      {step === 1 && stepConfirmEmail}
      {step === 2 && stepInputBackupKey}
      {step === 3 && stepEnterNewPassword}
    </div>
  );
}
