import { loginV3 } from "@app/hooks/api/auth/queries";

import Telemetry from "./telemetry/Telemetry";
import SecurityClient from "./SecurityClient";

export interface IsCliLoginSuccessful {
  loginResponse?: {
    email: string;
    privateKey: string;
    JTWToken: string;
  };
  success: boolean;
}

const attemptLogin = async ({
  email,
  password,
  captchaToken
}: {
  email: string;
  password: string;
  captchaToken?: string;
}): Promise<IsCliLoginSuccessful> => {
  const telemetry = new Telemetry().getInstance();

  console.log("Attempting login with server side...");
  const data = await loginV3({
    email,
    password,
    captchaToken
  });

  SecurityClient.setProviderAuthToken("");
  SecurityClient.setToken(data.accessToken);
  if (email) {
    telemetry.identify(email, email);
    telemetry.capture("User Logged In");
  }
  return {
    success: true,
    loginResponse: {
      email,
      privateKey: "",
      JTWToken: data.accessToken
    }
  };
};

export default attemptLogin;
