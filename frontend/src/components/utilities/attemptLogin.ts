/* eslint-disable prefer-destructuring */
import crypto from 'crypto';

import jsrp from 'jsrp';
import { SecretDataProps } from 'public/data/frequentInterfaces';

import Aes256Gcm from '@app/components/utilities/cryptography/aes-256-gcm';
import login1 from '@app/pages/api/auth/Login1';
import login2 from '@app/pages/api/auth/Login2';
import addSecrets from '@app/pages/api/files/AddSecrets';
import getOrganizations from '@app/pages/api/organization/getOrgs';
import getOrganizationUserProjects from '@app/pages/api/organization/GetOrgUserProjects';
import getUser from '@app/pages/api/user/getUser';
import uploadKeys from '@app/pages/api/workspace/uploadKeys';

import { deriveArgonKey, encryptAssymmetric } from './cryptography/crypto';
import encryptSecrets from './secrets/encryptSecrets';
import Telemetry from './telemetry/Telemetry';
import { saveTokenToLocalStorage } from './saveTokenToLocalStorage';
import SecurityClient from './SecurityClient';

// eslint-disable-next-line new-cap
const client = new jsrp.client();

/**
 * This function logs in the user (whether it's right after signup, or a normal login)
 * @param {string} email - email of the user logging in
 * @param {string} password - password of the user logging in
 * @param {function} setErrorLogin - function that visually dispay an error is something is wrong
 * @param {*} router
 * @param {boolean} isSignUp - whether this log in is a part of signup
 * @param {boolean} isLogin - ?
 * @returns
 */
const attemptLogin = async (
  email: string,
  password: string,
  setErrorLogin: (value: boolean) => void,
  router: any,
  isSignUp: boolean,
  isLogin: boolean
) => {
  try {
    const telemetry = new Telemetry().getInstance();

    client.init(
      {
        username: email,
        password
      },
      async () => {
        const clientPublicKey = client.getPublicKey();

        try {
          const { serverPublicKey, salt } = await login1(email, clientPublicKey);

          client.setSalt(salt);
          client.setServerPublicKey(serverPublicKey);
          const clientProof = client.getProof(); // called M1

          // if everything works, go the main dashboard page.
          const { // mfaEnabled
            encryptionVersion,
            protectedKey,
            protectedKeyIV,
            protectedKeyTag,
            token, 
            publicKey, 
            encryptedPrivateKey, 
            iv, 
            tag 
          } = await login2(
            email,
            clientProof
          );

          SecurityClient.setToken(token);

          let privateKey;
          if (encryptionVersion === 1) {
            privateKey = Aes256Gcm.decrypt({
              ciphertext: encryptedPrivateKey,
              iv,
              tag,
              secret: password
                .slice(0, 32)
                .padStart(32 + (password.slice(0, 32).length - new Blob([password]).size), '0')
            });

            saveTokenToLocalStorage({
              publicKey,
              encryptedPrivateKey,
              iv,
              tag,
              privateKey
            });
          } else if (encryptionVersion === 2 && protectedKey && protectedKeyIV && protectedKeyTag) {
            const derivedKey = await deriveArgonKey({
              password,
              salt,
              mem: 65536,
              time: 3,
              parallelism: 1,
              hashLen: 32
            });
            
            if (!derivedKey) throw new Error('Failed to derive key');

            const key = Aes256Gcm.decrypt({
              ciphertext: protectedKey,
              iv: protectedKeyIV,
              tag: protectedKeyTag,
              secret: Buffer.from(derivedKey.hash)
            });
            
            // decrypt back the private key
            privateKey = Aes256Gcm.decrypt({
              ciphertext: encryptedPrivateKey,
              iv,
              tag,
              secret: Buffer.from(key, 'hex')
            });

            saveTokenToLocalStorage({
              protectedKey,
              protectedKeyIV,
              protectedKeyTag,
              publicKey,
              encryptedPrivateKey,
              iv,
              tag,
              privateKey
            });
          }
          
          if (!privateKey) throw new Error('Failed to decrypt private key');

          const userOrgs = await getOrganizations();
          const userOrgsData = userOrgs.map((org: { _id: string }) => org._id);

          let orgToLogin;
          if (userOrgsData.includes(localStorage.getItem('orgData.id'))) {
            orgToLogin = localStorage.getItem('orgData.id');
          } else {
            orgToLogin = userOrgsData[0];
            localStorage.setItem('orgData.id', orgToLogin);
          }

          let orgUserProjects = await getOrganizationUserProjects({
            orgId: orgToLogin
          });

          orgUserProjects = orgUserProjects?.map((project: { _id: string }) => project._id);
          let projectToLogin;
          if (orgUserProjects.includes(localStorage.getItem('projectData.id'))) {
            projectToLogin = localStorage.getItem('projectData.id');
          } else {
            try {
              projectToLogin = orgUserProjects[0];
              localStorage.setItem('projectData.id', projectToLogin);
            } catch (error) {
              console.log('ERROR: User likely has no projects. ', error);
            }
          }

          if (email) {
            telemetry.identify(email);
            telemetry.capture('User Logged In');
          }

          if (isSignUp) {
            const randomBytes = crypto.randomBytes(16).toString('hex');
            const PRIVATE_KEY = String(localStorage.getItem('PRIVATE_KEY'));

            const myUser = await getUser();

            const { ciphertext, nonce } = encryptAssymmetric({
              plaintext: randomBytes,
              publicKey: myUser.publicKey,
              privateKey: PRIVATE_KEY
            }) as { ciphertext: string; nonce: string };

            await uploadKeys(projectToLogin, myUser._id, ciphertext, nonce);

            const secretsToBeAdded: SecretDataProps[] = [
              {
                pos: 0,
                key: 'DATABASE_URL',
                // eslint-disable-next-line no-template-curly-in-string
                value: 'mongodb+srv://${DB_USERNAME}:${DB_PASSWORD}@mongodb.net',
                valueOverride: undefined,
                comment: 'This is an example of secret referencing.',
                id: ''
              },
              {
                pos: 1,
                key: 'DB_USERNAME',
                value: 'OVERRIDE_THIS',
                valueOverride: undefined,
                comment:
                  'This is an example of secret overriding. Your team can have a shared value of a secret, while you can override it to whatever value you need',
                id: ''
              },
              {
                pos: 2,
                key: 'DB_PASSWORD',
                value: 'OVERRIDE_THIS',
                valueOverride: undefined,
                comment:
                  'This is an example of secret overriding. Your team can have a shared value of a secret, while you can override it to whatever value you need',
                id: ''
              },
              {
                pos: 3,
                key: 'DB_USERNAME',
                value: 'user1234',
                valueOverride: 'user1234',
                comment: '',
                id: ''
              },
              {
                pos: 4,
                key: 'DB_PASSWORD',
                value: 'example_password',
                valueOverride: 'example_password',
                comment: '',
                id: ''
              },
              {
                pos: 5,
                key: 'TWILIO_AUTH_TOKEN',
                value: 'example_twillio_token',
                valueOverride: undefined,
                comment: '',
                id: ''
              },
              {
                pos: 6,
                key: 'WEBSITE_URL',
                value: 'http://localhost:3000',
                valueOverride: undefined,
                comment: '',
                id: ''
              }
            ];
            const secrets = await encryptSecrets({
              secretsToEncrypt: secretsToBeAdded,
              workspaceId: String(localStorage.getItem('projectData.id')),
              env: 'dev'
            });
            await addSecrets({
              secrets: secrets ?? [],
              env: 'dev',
              workspaceId: String(localStorage.getItem('projectData.id'))
            });
          }

          if (isLogin) {
            if (localStorage.getItem('projectData.id') !== "undefined") {
              router.push(`/dashboard/${localStorage.getItem('projectData.id')}`);
            } else {
              router.push("/noprojects");
            }
          }
        } catch (error) {
          console.log(error);
          setErrorLogin(true);
          console.log('Login response not available');
        }
      }
    );
  } catch (error) {
    console.log('Something went wrong during authentication');
  }
  return true;
};

export default attemptLogin;
