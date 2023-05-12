import crypto from 'crypto';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { faCheck, faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import jsrp from 'jsrp';
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';

import completeAccountInformationSignup from '@app/pages/api/auth/CompleteAccountInformationSignup';
import getOrganizations from '@app/pages/api/organization/getOrgs';
import ProjectService from '@app/services/ProjectService';

import Button from '../basic/buttons/Button';
import InputField from '../basic/InputField';
import passwordCheck from '../utilities/checks/PasswordCheck';
import Aes256Gcm from '../utilities/cryptography/aes-256-gcm';
import { deriveArgonKey } from '../utilities/cryptography/crypto';
import { saveTokenToLocalStorage } from '../utilities/saveTokenToLocalStorage';
import SecurityClient from '../utilities/SecurityClient';

// eslint-disable-next-line new-cap
const client = new jsrp.client();

interface UserInfoStepProps {
  incrementStep: () => void;
  email: string;
  password: string;
  setPassword: (value: string) => void;
  firstName: string;
  setFirstName: (value: string) => void;
  lastName: string;
  setLastName: (value: string) => void;
}

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
  firstName,
  setFirstName,
  lastName,
  setLastName
}: UserInfoStepProps): JSX.Element {
  const [firstNameError, setFirstNameError] = useState(false);
  const [lastNameError, setLastNameError] = useState(false);
  const [passwordErrorLength, setPasswordErrorLength] = useState(false);
  const [passwordErrorNumber, setPasswordErrorNumber] = useState(false);
  const [passwordErrorLowerCase, setPasswordErrorLowerCase] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();

  // Verifies if the information that the users entered (name, workspace)
  // is there, and if the password matches the criteria.
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

              const response = await completeAccountInformationSignup({
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
                verifier: result.verifier,
                organizationName: `${firstName}'s organization`
              });

              // unset signup JWT token and set JWT token
              SecurityClient.setSignupToken('');
              SecurityClient.setToken(response.token);

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
                projectName: 'Example Project'
              });

              localStorage.setItem('orgData.id', orgId);
              localStorage.setItem('projectData.id', project._id);

              incrementStep();
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
    <div className="h-7/12 mx-auto mb-36 w-max rounded-xl bg-bunker py-10 px-8 drop-shadow-xl md:mb-16">
      <p className="mx-8 mb-6 flex justify-center text-4xl font-bold text-primary md:mx-16">
        {t('signup.step3-message')}
      </p>
      <div className="relative z-0 flex max-h-24 w-full items-center justify-end rounded-lg md:p-2">
        <InputField
          label={t('common.first-name')}
          onChangeHandler={setFirstName}
          type="name"
          value={firstName}
          isRequired
          errorText={
            t('common.validate-required', {
              name: t('common.first-name')
            }) as string
          }
          error={firstNameError}
          autoComplete="given-name"
        />
      </div>
      <div className="mt-2 flex max-h-24 w-full items-center justify-center rounded-lg md:p-2">
        <InputField
          label={t('common.last-name')}
          onChangeHandler={setLastName}
          type="name"
          value={lastName}
          isRequired
          errorText={
            t('common.validate-required', {
              name: t('common.last-name')
            }) as string
          }
          error={lastNameError}
          autoComplete="family-name"
        />
      </div>
      <div className="mt-2 flex max-h-60 w-full flex-col items-center justify-center rounded-lg md:p-2">
        <InputField
          label={t('section.password.password')}
          onChangeHandler={(pass: string) => {
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
          <div className="mt-4 flex w-full flex-col items-start rounded-md bg-white/5 px-2 py-2">
            <div className="mb-1 text-sm text-gray-400">{t('section.password.validate-base')}</div>
            <div className="ml-1 flex flex-row items-center justify-start">
              {passwordErrorLength ? (
                <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
              )}
              <div className={`${passwordErrorLength ? 'text-gray-400' : 'text-gray-600'} text-sm`}>
                {t('section.password.validate-length')}
              </div>
            </div>
            <div className="ml-1 flex flex-row items-center justify-start">
              {passwordErrorLowerCase ? (
                <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
              )}
              <div
                className={`${passwordErrorLowerCase ? 'text-gray-400' : 'text-gray-600'} text-sm`}
              >
                {t('section.password.validate-case')}
              </div>
            </div>
            <div className="ml-1 flex flex-row items-center justify-start">
              {passwordErrorNumber ? (
                <FontAwesomeIcon icon={faX} className="text-md mr-2.5 text-red" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md mr-2 text-primary" />
              )}
              <div className={`${passwordErrorNumber ? 'text-gray-400' : 'text-gray-600'} text-sm`}>
                {t('section.password.validate-number')}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-2" />
        )}
      </div>
      <div className="mx-auto flex max-h-48 max-w-max flex-col items-center justify-center px-2 py-3 text-lg md:p-2">
        <Button
          text={t('signup.signup') ?? ''}
          loading={isLoading}
          onButtonPressed={signupErrorCheck}
          size="lg"
        />
      </div>
    </div>
  );
}
