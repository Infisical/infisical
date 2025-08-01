/* eslint-disable prefer-destructuring */
import axios from "axios";
import jsrp from "jsrp";

import { login1, login2, loginV3 } from "@app/hooks/api/auth/queries";

import { createNotification } from "../notifications";
import Telemetry from "./telemetry/Telemetry";
import SecurityClient from "./SecurityClient";

export enum LoginMode {
  LegacySrp = "legacy-srp",
  ServerSide = "server-side"
}

interface IsLoginSuccessful {
  success: boolean;
}

/**
 * Return whether or not login is successful for user with email [email]
 * and password [password]
 * @param {string} email - email of user to log in
 * @param {string} password - password of user to log in
 */
const attemptLogin = async ({
  email,
  password,
  providerAuthToken,
  captchaToken,
  loginMode = LoginMode.ServerSide
}: {
  email: string;
  password: string;
  providerAuthToken?: string;
  captchaToken?: string;
  loginMode?: LoginMode;
}): Promise<IsLoginSuccessful> => {
  const telemetry = new Telemetry().getInstance();

  if (loginMode === LoginMode.ServerSide) {
    console.log("Attempting login with server side...");
    const data = await loginV3({
      email,
      password,
      providerAuthToken,
      captchaToken
    }).catch((err) => {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        if (err.response?.data?.error === "LegacyEncryptionScheme") {
          createNotification({
            text: "Failed to login without SRP, attempting to authenticate with legacy SRP authentication.",
            type: "error"
          });

          return null;
        }
      }

      throw err;
    });

    if (data === null) {
      return attemptLogin({
        email,
        password,
        providerAuthToken,
        captchaToken,
        loginMode: LoginMode.LegacySrp
      });
    }

    SecurityClient.setProviderAuthToken("");
    SecurityClient.setToken(data.accessToken);

    if (email) {
      telemetry.identify(email, email);
      telemetry.capture("User Logged In");
    }

    return {
      success: true
    };
  }

  // eslint-disable-next-line new-cap
  const client = new jsrp.client();
  await new Promise((resolve) => {
    client.init({ username: email, password }, () => resolve(null));
  });
  const clientPublicKey = client.getPublicKey();

  const { serverPublicKey, salt } = await login1({
    email,
    clientPublicKey,
    providerAuthToken
  });

  client.setSalt(salt);
  client.setServerPublicKey(serverPublicKey);
  const clientProof = client.getProof(); // called M1

  const { encryptionVersion, token, encryptedPrivateKey, iv, tag } = await login2({
    captchaToken,
    email,
    password,
    clientProof,
    providerAuthToken
  });

  if (encryptionVersion && encryptedPrivateKey && iv && tag && token) {
    // unset provider auth token in case it was used
    SecurityClient.setProviderAuthToken("");
    // set JWT token
    SecurityClient.setToken(token);

    if (email) {
      telemetry.identify(email, email);
      telemetry.capture("User Logged In");
    }

    return {
      success: true
    };
  }
  return { success: false };
};

export default attemptLogin;
