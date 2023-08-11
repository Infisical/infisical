/* eslint-disable prefer-destructuring */
import jsrp from "jsrp";

import { login1 , verifyMfaToken } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { fetchMyOrganizationProjects } from "@app/hooks/api/users/queries";
// import verifyMfaToken from "@app/pages/api/auth/verifyMfaToken";
import KeyService from "@app/services/KeyService";

import { saveTokenToLocalStorage } from "./saveTokenToLocalStorage";
import SecurityClient from "./SecurityClient";

// eslint-disable-next-line new-cap
const client = new jsrp.client();

interface IsMfaLoginSuccessful {
    success: boolean;
    loginResponse:{ 
        privateKey: string;
        JTWToken: string;
    }
    
}

/**
 * Return whether or not MFA-login is successful for user with email [email]
 * and MFA token [mfaToken]
 * @param {Object} obj
 * @param {String} obj.email - email of user
 * @param {String} obj.mfaToken - MFA code/token
 */
const attemptLoginMfa = async ({
    email,
    password,
    providerAuthToken,
    mfaToken
}: {
    email: string;
    password: string;
    providerAuthToken?: string,
    mfaToken: string;
}): Promise<IsMfaLoginSuccessful> => {
    return new Promise((resolve, reject) => {
        client.init({
            username: email,
            password
        }, async () => {
            try {
                const clientPublicKey = client.getPublicKey();
                const { salt } = await login1({
                    email,
                    clientPublicKey,
                    providerAuthToken,
                });

                const {
                    encryptionVersion,
                    protectedKey,
                    protectedKeyIV,
                    protectedKeyTag,
                    token,
                    publicKey,
                    encryptedPrivateKey,
                    iv,
                    tag
                } = await verifyMfaToken({
                    email,
                    mfaCode: mfaToken
                });

                // unset temporary (MFA) JWT token and set JWT token
                SecurityClient.setMfaToken("");
                SecurityClient.setToken(token);
                SecurityClient.setProviderAuthToken("");

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
                const userOrgs = await fetchOrganizations();
                const orgId = userOrgs[0]._id;
                localStorage.setItem("orgData.id", orgId);

                const orgUserProjects = await fetchMyOrganizationProjects(orgId);
                localStorage.setItem("projectData.id", orgUserProjects[0]._id);

                resolve({
                    success: true,
                    loginResponse:{
                        privateKey,
                        JTWToken: token
                    }
                });
            } catch (err) {
                reject(err);
            }
        });
    });
}

export default attemptLoginMfa;