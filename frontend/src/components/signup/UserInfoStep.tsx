import crypto from 'crypto';

import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons';
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
import { Input } from '../v2';

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
  providerAuthToken,
}: UserInfoStepProps): JSX.Element {
  const [nameError, setNameError] = useState(false);
  const [organizationNameError, setOrganizationNameError] = useState(false);
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
                firstName: name.split(" ")[0],
                lastName: name.split(" ")[1],
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
              });

              // unset signup JWT token and set JWT token
              SecurityClient.setSignupToken('');
              SecurityClient.setToken(response.token);
              SecurityClient.setProviderAuthToken('');

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
    <div className="w-max mx-auto h-full px-8 mb-36 md:mb-16">
      <p className="text-xl font-medium flex justify-center mb-6 mx-8 md:mx-16 text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200">
        Tell us a bit about yourself
      </p>
      <div className="relative z-0 flex flex-col items-center justify-end w-full md:p-2 rounded-lg max-h-24">
        <p className='text-left w-full text-sm text-bunker-300 mb-1 ml-1 font-medium'>Your Name</p>
        <Input
          placeholder="Jane Doe"
          onChange={(e) => setName(e.target.value)}
          value={name}
          isRequired
          autoComplete="given-name"
          className="h-12"
        />
        {nameError && <p className='text-left w-full text-xs text-red-600 mt-1 ml-1'>Please, specify your name</p>}
      </div>
      <div className="relative z-0 flex flex-col items-center justify-end w-full md:p-2 rounded-lg max-h-24">
        <p className='text-left w-full text-sm text-bunker-300 mb-1 ml-1 font-medium'>Organization Name</p>
        <Input
          placeholder="Infisical"
          onChange={(e) => setOrganizationName(e.target.value)}
          value={organizationName}
          isRequired
          className="h-12"
        />
        {organizationNameError && <p className='text-left w-full text-xs text-red-600 mt-1 ml-1'>Please, specify your organization name</p>}
      </div>
      <div className="relative z-0 flex flex-col items-center justify-end w-full md:p-2 rounded-lg max-h-24">
        <p className='text-left w-full text-sm text-bunker-300 mb-1 ml-1 font-medium'>Where did you hear about us? <span className="font-light">(optional)</span></p>
        <Input
          placeholder=""
          onChange={(e) => setAttributionSource(e.target.value)}
          value={attributionSource}
          isRequired
          className="h-12"
        />
      </div>
      <div className="flex flex-col items-center justify-center w-full md:p-2 rounded-lg max-h-60">
        <InputField
          label={t('section-password:password')}
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
          <div className="w-full mt-4 bg-white/5 px-2 flex flex-col items-start py-2 rounded-md">
            <div className="text-gray-400 text-sm mb-1">{t('section-password:validate-base')}</div>
            <div className="flex flex-row justify-start items-center ml-1">
              {passwordErrorLength ? (
                <FontAwesomeIcon icon={faXmark} className="text-md text-red ml-0.5 mr-2.5" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md text-primary mr-2" />
              )}
              <div className={`${passwordErrorLength ? 'text-gray-400' : 'text-gray-600'} text-sm`}>
                {t('section-password:validate-length')}
              </div>
            </div>
            <div className="flex flex-row justify-start items-center ml-1">
              {passwordErrorLowerCase ? (
                <FontAwesomeIcon icon={faXmark} className="text-md text-red ml-0.5 mr-2.5" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md text-primary mr-2" />
              )}
              <div
                className={`${passwordErrorLowerCase ? 'text-gray-400' : 'text-gray-600'} text-sm`}
              >
                {t('section-password:validate-case')}
              </div>
            </div>
            <div className="flex flex-row justify-start items-center ml-1">
              {passwordErrorNumber ? (
                <FontAwesomeIcon icon={faXmark} className="text-md text-red ml-0.5 mr-2.5" />
              ) : (
                <FontAwesomeIcon icon={faCheck} className="text-md text-primary mr-2" />
              )}
              <div className={`${passwordErrorNumber ? 'text-gray-400' : 'text-gray-600'} text-sm`}>
                {t('section-password:validate-number')}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-2" />
        )}
      </div>
      <div className="flex flex-col items-center justify-center md:p-2 max-h-48 max-w-max mx-auto text-lg px-2 py-3">
        <Button
          text={t('signup:signup') ?? ''}
          loading={isLoading}
          onButtonPressed={signupErrorCheck}
          size="lg"
        />
      </div>
    </div>
  );
}