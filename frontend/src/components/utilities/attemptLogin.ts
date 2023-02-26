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
            SecurityClient.setMfaToken(token);

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
            
            if (orgUserProjects.length > 0) {
              localStorage.setItem('projectData.id', orgUserProjects[0]._id);
            }

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