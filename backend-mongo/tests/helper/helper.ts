// Helper functions for integration tests

import axiosInstance from "../../src/config/request";
import { Secret } from "../../src/models";
import { testUserEmail, testUserPassword } from "../../src/utils/addDevelopmentUser";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const crypto = require("crypto")
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsrp = require("jsrp");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");
import { plainTextWorkspaceKey, testWorkspaceId } from "../../src/utils/addDevelopmentUser";
import {
  encryptSymmetric128BitHexKeyUTF8,
} from "../../src/utils/crypto";

interface TokenData {
  token: string;
  publicKey: string;
  encryptedPrivateKey: string;
  iv: string;
  tag: string;
}

export const getJWTFromTestUser = (): Promise<TokenData> => {
  return new Promise((resolve, reject) => {
    const client = new jsrp.client();
    const EMAIL = testUserEmail
    const PASSWORD = testUserPassword

    client.init({
      username: EMAIL,
      password: PASSWORD,
    }, async () => {
      const clientPublicKey = client.getPublicKey();

      // POST: /login1 
      const reqBody = {
        email: EMAIL,
        clientPublicKey,
      }


      const loginOneRes = await axiosInstance.post("http://localhost:4000/api/v1/auth/login1", reqBody);
      const serverPublicKey = loginOneRes.data.serverPublicKey;
      const salt = loginOneRes.data.salt;

      client.setSalt(salt);
      client.setServerPublicKey(serverPublicKey);
      const clientSharedKey = client.getSharedKey(); // shared Key
      const clientProof = client.getProof(); // called M1

      // POST: /login2
      const reqBody2 = {
        email: EMAIL,
        clientProof,
      }

      const response2 = await axiosInstance.post("http://localhost:4000/api/v1/auth/login2", reqBody2);

      resolve(response2.data)
    })
  });
}

export const getServiceTokenFromTestUser = async () => {
  const loggedInUserDetails = await getJWTFromTestUser()
  const randomBytes = crypto.randomBytes(16).toString("hex");
  const { ciphertext, iv, tag } = encryptSymmetric128BitHexKeyUTF8({
    plaintext: plainTextWorkspaceKey,
    key: randomBytes,
  });

  const newServiceToken = await axiosInstance.post("http://localhost:4000/api/v2/service-token/", {
    "name": "test service token",
    "workspaceId": testWorkspaceId,
    "environment": "dev",
    "encryptedKey": ciphertext,
    "iv": iv,
    "tag": tag,
    "expiresIn": Date.now() + 90000,
    "permissions": ["read"],
  }, {
    headers: {
      "Authorization": `Bearer ${loggedInUserDetails.token}`,
    },
  });

  return `${newServiceToken.data.serviceToken}.${randomBytes}`
}

export const deleteAllSecrets = async () => {
  await Secret.deleteMany()
}

export const getAllSecrets = async () => {
  return await Secret.find()
}