import Aes256Gcm from '~/components/utilities/cryptography/aes-256-gcm';
import login1 from '~/pages/api/auth/Login1';
import login2 from '~/pages/api/auth/Login2';
import getOrganizations from '~/pages/api/organization/getOrgs';
import getOrganizationUserProjects from '~/pages/api/organization/GetOrgUserProjects';

import pushKeys from './secrets/pushKeys';
import Telemetry from './telemetry/Telemetry';
import { saveTokenToLocalStorage } from './saveTokenToLocalStorage';
import SecurityClient from './SecurityClient';

const nacl = require('tweetnacl');
nacl.util = require('tweetnacl-util');
const jsrp = require('jsrp');
const client = new jsrp.client();

/**
 * This function loggs in the user (whether it's right after signup, or a normal login)
 * @param {*} email
 * @param {*} password
 * @param {*} setErrorLogin
 * @param {*} router
 * @param {*} isSignUp
 * @returns
 */
const attemptLogin = async (
  email,
  password,
  setErrorLogin,
  router,
  isSignUp,
  isLogin
) => {
  try {
    const telemetry = new Telemetry().getInstance();

    client.init(
      {
        username: email,
        password: password
      },
      async () => {
        const clientPublicKey = client.getPublicKey();

        try {
          const { serverPublicKey, salt } = await login1(email, clientPublicKey);

          client.setSalt(salt);
          client.setServerPublicKey(serverPublicKey);
          const clientProof = client.getProof(); // called M1

          // if everything works, go the main dashboard page.
          const { token, publicKey, encryptedPrivateKey, iv, tag } =
            await login2(email, clientProof);
          SecurityClient.setToken(token);

          const privateKey = Aes256Gcm.decrypt({
            ciphertext: encryptedPrivateKey,
            iv,
            tag,
            secret: password
              .slice(0, 32)
              .padStart(
                32 + (password.slice(0, 32).length - new Blob([password]).size),
                '0'
              )
          });

          saveTokenToLocalStorage({
            publicKey,
            encryptedPrivateKey,
            iv,
            tag,
            privateKey
          });
          
          const userOrgs = await getOrganizations();
          const userOrgsData = userOrgs.map((org) => org._id);

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

          orgUserProjects = orgUserProjects?.map((project) => project._id);
          let projectToLogin;
          if (
            orgUserProjects.includes(localStorage.getItem('projectData.id'))
          ) {
            projectToLogin = localStorage.getItem('projectData.id');
          } else {
            try {
              projectToLogin = orgUserProjects[0];
              localStorage.setItem('projectData.id', projectToLogin);
            } catch (error) {
              console.log('ERROR: User likely has no projects. ', error);
            }
          }

          // If user is logging in for the first time, add the example keys
          if (isSignUp) {
            await pushKeys({
              obj: {
                sDATABASE_URL: [
                  'mongodb+srv://${DB_USERNAME}:${DB_PASSWORD}@mongodb.net',
                  'This is an example of secret referencing.'
                ],
                sDB_USERNAME: ['OVERRIDE_THIS', ''],
                sDB_PASSWORD: ['OVERRIDE_THIS', ''],
                pDB_USERNAME: ['user1234', 'This is an example of secret overriding. Your team can have a shared value of a secret, while you can override it to whatever value you need.'],
                pDB_PASSWORD: ['example_password', 'This is an example of secret overriding. Your team can have a shared value of a secret, while you can override it to whatever value you need.'],
                sTWILIO_AUTH_TOKEN: ['example_twillio_token', ''],
                sWEBSITE_URL: ['http://localhost:3000', ''],
              },
              workspaceId: projectToLogin,
              env: 'Development'
            });
          }
          if (email) {
            telemetry.identify(email);
            telemetry.capture('User Logged In');
          }

          if (isLogin) {
            router.push('/dashboard/');
          }
        } catch (error) {
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
