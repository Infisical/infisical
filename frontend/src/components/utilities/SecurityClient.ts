import { getAuthToken, setAuthToken } from '@app/reactQuery';

// depreciated: go for apiRequest module in config/api
export default class SecurityClient {
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
