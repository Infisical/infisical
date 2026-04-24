import { setAuthToken, setMfaTempToken, setSignupTempToken } from "@app/hooks/api/reactQuery";

// depreciated: go for apiRequest module in config/api
export default class SecurityClient {
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
