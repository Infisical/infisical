import { setAuthToken, setMfaTempToken, setSignupTempToken } from "@app/hooks/api/reactQuery";

export const PROVIDER_AUTH_TOKEN_KEY = "infisical__provider-auth-token";

// depreciated: go for apiRequest module in config/api
export default class SecurityClient {
  static setProviderAuthToken(tokenStr: string) {
    localStorage.setItem(PROVIDER_AUTH_TOKEN_KEY, tokenStr || "");
  }

  static getProviderAuthToken() {
    return localStorage.getItem(PROVIDER_AUTH_TOKEN_KEY);
  }

  static setSignupToken(tokenStr: string) {
    setSignupTempToken(tokenStr);
  }

  static setMfaToken(tokenStr: string) {
    setMfaTempToken(tokenStr);
  }

  static setToken(tokenStr: string) {
    setAuthToken(tokenStr);
  }
}
