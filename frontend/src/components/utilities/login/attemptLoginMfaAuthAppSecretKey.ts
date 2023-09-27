/* eslint-disable prefer-destructuring */
import jsrp from "jsrp";

import { login1, verifyMfaAuthAppSecretKey } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { fetchMyOrganizationProjects } from "@app/hooks/api/users/queries";
import KeyService from "@app/services/KeyService";

import { saveTokenToLocalStorage } from "../saveTokenToLocalStorage";
import SecurityClient from "../SecurityClient";

// eslint-disable-next-line new-cap
const client = new jsrp.client();

/**
 * Return whether or not MFA-login is successful for user with the authenticator app 
 * (using the TOTP from their authenticator app ) [userTotp]
 * and MFA token [mfaToken]
 * @param {Object} obj
 * @param {String} obj.email - email of user
 * @param {String} obj.userSecretKey - two-factor authenticator secret key entered by the user
 */
export const attemptLoginMfaAuthAppSecretKey = async ({
    email,
    password,
    providerAuthToken,
    userSecretKey,
}: {
    email: string;
    password: string;
    providerAuthToken?: string,
    userSecretKey: string;
}): Promise<Boolean> => {
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
                } = await verifyMfaAuthAppSecretKey({
                    email,
                    userSecretKey,
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

                resolve(true);
            } catch (err) {
                reject(err);
            }
        });
    });
}