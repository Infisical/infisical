import { loginV3 } from "@app/hooks/api/auth/queries";
import { setAuthToken } from "@app/hooks/api/reactQuery";

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
  captchaToken
}: {
  email: string;
  password: string;
  providerAuthToken?: string;
  captchaToken?: string;
}): Promise<IsLoginSuccessful> => {
  const telemetry = new Telemetry().getInstance();

  const data = await loginV3({
    email,
    password,
    providerAuthToken,
    captchaToken
  });

  SecurityClient.setProviderAuthToken("");
  setAuthToken(data.accessToken);

  if (email) {
    telemetry.identify(email, email);
    telemetry.capture("User Logged In");
  }

  return { success: true };
};

export default attemptLogin;
