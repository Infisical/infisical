import token from '@app/pages/api/auth/Token';

import { BACKEND_API_URL } from './config';

export default class SecurityClient {
  static #token = '';

  static setToken(tokenStr: string) {
    this.#token = tokenStr;
  }

  static async fetchCall(resource: RequestInfo, options?: RequestInit | undefined) {
    const req = new Request(`${BACKEND_API_URL}${resource}`, options);

    if (this.#token === '') {
      try {
        // TODO: This should be moved to a context to do it only once when app loads
        // this try catch saves route guard from a stuck state
        this.setToken(await token());
      } catch (error) {
        console.error('Unauthorized access');
      }
    }

    if (this.#token) {
      req.headers.set('Authorization', `Bearer ${this.#token}`);
    }

    return fetch(req);
  }
}
