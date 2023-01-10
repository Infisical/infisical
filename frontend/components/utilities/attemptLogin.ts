import Aes256Gcm from '~/components/utilities/cryptography/aes-256-gcm';
import login1 from '~/pages/api/auth/Login1';
import login2 from '~/pages/api/auth/Login2';
import addSecrets from '~/pages/api/files/AddSecrets';
import getOrganizations from '~/pages/api/organization/getOrgs';
import getOrganizationUserProjects from '~/pages/api/organization/GetOrgUserProjects';
import getUser from '~/pages/api/user/getUser';
import uploadKeys from '~/pages/api/workspace/uploadKeys';

import { encryptAssymmetric } from './cryptography/crypto';
import encryptSecrets from './secrets/encryptSecrets';
import Telemetry from './telemetry/Telemetry';
import { saveTokenToLocalStorage } from './saveTokenToLocalStorage';
import SecurityClient from './SecurityClient';

interface SecretDataProps {
  type: 'personal' | 'shared';
  pos: number;
  key: string;
  value: string;
  id: string;
  comment: string;
}

const crypto = require("crypto");
const nacl = require('tweetnacl');
nacl.util = require('tweetnacl-util');
const jsrp = require('jsrp');
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
          const userOrgsData = userOrgs.map((org: { _id: string; }) => org._id);

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

          orgUserProjects = orgUserProjects?.map((project: { _id: string; }) => project._id);
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
          
          if (email) {
            telemetry.identify(email);
            telemetry.capture('User Logged In');
          }

          if (isSignUp) {
            const randomBytes = crypto.randomBytes(16).toString("hex");
            const PRIVATE_KEY = String(localStorage.getItem("PRIVATE_KEY"));

            const myUser = await getUser();

            const { ciphertext, nonce } = encryptAssymmetric({
              plaintext: randomBytes,
              publicKey: myUser.publicKey,
              privateKey: PRIVATE_KEY,
            }) as { ciphertext: string; nonce: string };

            await uploadKeys(
              projectToLogin,
              myUser._id,
              ciphertext,
              nonce
            );

            const secretsToBeAdded: SecretDataProps[] = [{
              type: "shared",
              pos: 0,
              key: "DATABASE_URL",
              value: "mongodb+srv://${DB_USERNAME}:${DB_PASSWORD}@mongodb.net",
              comment: "This is an example of secret referencing.",
              id: ''
            }, {
              type: "shared",
              pos: 1,
              key: "DB_USERNAME",
              value: "OVERRIDE_THIS",
              comment: "This is an example of secret overriding. Your team can have a shared value of a secret, while you can override it to whatever value you need",
              id: ''
            }, {
              type: "personal",
              pos: 2,
              key: "DB_USERNAME",
              value: "user1234",
              comment: "",
              id: ''
            }, {
              type: "shared",
              pos: 3,
              key: "DB_PASSWORD",
              value: "OVERRIDE_THIS",
              comment: "This is an example of secret overriding. Your team can have a shared value of a secret, while you can override it to whatever value you need",
              id: ''
            }, {
              type: "personal",
              pos: 4,
              key: "DB_PASSWORD",
              value: "example_password",
              comment: "",
              id: ''
            }, {
              type: "shared",
              pos: 5,
              key: "TWILIO_AUTH_TOKEN",
              value: "example_twillio_token",
              comment: "This is an example of secret overriding. Your team can have a shared value of a secret, while you can override it to whatever value you need",
              id: ''
            }, {
              type: "shared",
              pos: 6,
              key: "WEBSITE_URL",
              value: "http://localhost:3000",
              comment: "This is an example of secret overriding. Your team can have a shared value of a secret, while you can override it to whatever value you need",
              id: ''
            }]
            const secrets = await encryptSecrets({ secretsToEncrypt: secretsToBeAdded, workspaceId: String(localStorage.getItem('projectData.id')), env: 'dev' })
            await addSecrets({ secrets: secrets ?? [], env: "dev", workspaceId: String(localStorage.getItem('projectData.id')) });
          }

          if (isLogin) {
            router.push('/dashboard/' + localStorage.getItem('projectData.id'));
          }
        } catch (error) {
          console.log(error)
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
