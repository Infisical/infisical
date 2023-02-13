import { getAuthToken, setAuthToken , setMfaTempToken } from '@app/reactQuery';

// depreciated: go for apiRequest module in config/api
export default class SecurityClient {
  static setMfaToken(tokenStr: string) {
    setMfaTempToken(tokenStr);
  }

  static setToken(tokenStr: string) {
    setAuthToken(tokenStr);
  }

  static async fetchCall(resource: RequestInfo, options?: RequestInit | undefined) {
    const req = new Request(resource, options);

    const token = getAuthToken();

    if (token) {
      req.headers.set('Authorization', `Bearer ${token}`);
    }

    return fetch(req);
  }
}
