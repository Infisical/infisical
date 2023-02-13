/* eslint-disable prefer-destructuring */
import jsrp from 'jsrp';

import login1 from '@app/pages/api/auth/Login1';
import login2 from '@app/pages/api/auth/Login2';
import getOrganizations from '@app/pages/api/organization/getOrgs';
import getOrganizationUserProjects from '@app/pages/api/organization/GetOrgUserProjects';
import KeyService from '@app/services/KeyService';

import Telemetry from './telemetry/Telemetry';
import { saveTokenToLocalStorage } from './saveTokenToLocalStorage';
import SecurityClient from './SecurityClient';

// eslint-disable-next-line new-cap
const client = new jsrp.client();

interface IsLoginSuccessful {
  mfaEnabled: boolean;
  success: boolean;
}

/**
 * Return whether or not login is successful for user with email [email]
 * and password [password]
 * @param {string} email - email of user to log in
 * @param {string} password - password of user to log in
 */
const attemptLogin = async (
  email: string,
  password: string
): Promise<IsLoginSuccessful> => {
  const telemetry = new Telemetry().getInstance();
  return new Promise((resolve, reject) => {
    client.init(
      {
        username: email,
        password
      },
      async () => {
        try {
          const clientPublicKey = client.getPublicKey();
          const { serverPublicKey, salt } = await login1(email, clientPublicKey);

          client.setSalt(salt);
          client.setServerPublicKey(serverPublicKey);
          const clientProof = client.getProof(); // called M1

          const {
            mfaEnabled,
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
          
          if (mfaEnabled) {
            // case: MFA is enabled

            // set temporary (MFA) JWT token
            SecurityClient.setToken(token);

            resolve({
              mfaEnabled,
              success: true
            });
          } else if (
            !mfaEnabled &&
            encryptionVersion &&
            encryptedPrivateKey &&
            iv &&
            tag &&
            token
          ) {
            // case: MFA is not enabled
            
            // set JWT token
            SecurityClient.setToken(token);
            
            const privateKey = await KeyService.decryptPrivateKey({
              encryptionVersion,
              encryptedPrivateKey,
              iv,
              tag,
              password,
              salt,
              protectedKey,
              protectedKeyIV,
              protectedKeyTag
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
            
            // TODO: in the future - move this logic elsewhere
            // because this function is about logging the user in
            // and not initializing the login details
            const userOrgs = await getOrganizations(); 
            const orgId = userOrgs[0]._id;
            localStorage.setItem('orgData.id', orgId);

            const orgUserProjects = await getOrganizationUserProjects({
              orgId
            });
            localStorage.setItem('projectData.id', orgUserProjects[0]._id);
            
            // // TODO: this part definitely needs to be refactored
            // const userOrgs = await getOrganizations();
            // const userOrgsData = userOrgs.map((org: { _id: string }) => org._id);

            // let orgToLogin;
            // if (userOrgsData.includes(localStorage.getItem('orgData.id'))) {
            //   orgToLogin = localStorage.getItem('orgData.id');
            // } else {
            //   orgToLogin = userOrgsData[0];
            //   localStorage.setItem('orgData.id', orgToLogin);
            // }

            // let orgUserProjects = await getOrganizationUserProjects({
            //   orgId: orgToLogin
            // });

            // orgUserProjects = orgUserProjects?.map((project: { _id: string }) => project._id);
            // let projectToLogin;
            // if (orgUserProjects.includes(localStorage.getItem('projectData.id'))) {
            //   projectToLogin = localStorage.getItem('projectData.id');
            // } else {
            //   try {
            //     projectToLogin = orgUserProjects[0];
            //     localStorage.setItem('projectData.id', projectToLogin);
            //   } catch (error) {
            //     console.log('ERROR: User likely has no projects. ', error);
            //   }
            // }

            if (email) {
              telemetry.identify(email);
              telemetry.capture('User Logged In');
            }
            
            resolve({
              mfaEnabled: false,
              success: true
            });
          }
        } catch (err) {
          reject(err);
        }
      }
    );
  });
};

export default attemptLogin;

// should be function: init first project

// if (isSignUp) {
//   const randomBytes = crypto.randomBytes(16).toString('hex');
//   const PRIVATE_KEY = String(localStorage.getItem('PRIVATE_KEY'));

//   const myUser = await getUser();

//   const { ciphertext, nonce } = encryptAssymmetric({
//     plaintext: randomBytes,
//     publicKey: myUser.publicKey,
//     privateKey: PRIVATE_KEY
//   }) as { ciphertext: string; nonce: string };

//   await uploadKeys(projectToLogin, myUser._id, ciphertext, nonce);

//   const secretsToBeAdded: SecretDataProps[] = [
//     {
//       pos: 0,
//       key: 'DATABASE_URL',
//       // eslint-disable-next-line no-template-curly-in-string
//       value: 'mongodb+srv://${DB_USERNAME}:${DB_PASSWORD}@mongodb.net',
//       valueOverride: undefined,
//       comment: 'Secret referencing example',
//       id: '',
//       tags: []
//     },
//     {
//       pos: 1,
//       key: 'DB_USERNAME',
//       value: 'OVERRIDE_THIS',
//       valueOverride: undefined,
//       comment:
//         'Override secrets with personal value',
//       id: '',
//       tags: []
//     },
//     {
//       pos: 2,
//       key: 'DB_PASSWORD',
//       value: 'OVERRIDE_THIS',
//       valueOverride: undefined,
//       comment:
//         'Another secret override',
//       id: '',
//       tags: []
//     },
//     {
//       pos: 3,
//       key: 'DB_USERNAME',
//       value: 'user1234',
//       valueOverride: 'user1234',
//       comment: '',
//       id: '',
//       tags: []
//     },
//     {
//       pos: 4,
//       key: 'DB_PASSWORD',
//       value: 'example_password',
//       valueOverride: 'example_password',
//       comment: '',
//       id: '',
//       tags: []
//     },
//     {
//       pos: 5,
//       key: 'TWILIO_AUTH_TOKEN',
//       value: 'example_twillio_token',
//       valueOverride: undefined,
//       comment: '',
//       id: '',
//       tags: []
//     },
//     {
//       pos: 6,
//       key: 'WEBSITE_URL',
//       value: 'http://localhost:3000',
//       valueOverride: undefined,
//       comment: '',
//       id: '',
//       tags: []
//     }
//   ];
//   const secrets = await encryptSecrets({
//     secretsToEncrypt: secretsToBeAdded,
//     workspaceId: String(localStorage.getItem('projectData.id')),
//     env: 'dev'
//   });
//   await addSecrets({
//     secrets: secrets ?? [],
//     env: 'dev',
//     workspaceId: String(localStorage.getItem('projectData.id'))
//   });
      // }