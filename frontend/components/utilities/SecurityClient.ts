import token from '~/pages/api/auth/Token';

export default class SecurityClient {
  static #token = '';

  constructor() {}

  static setToken(token: string) {
    this.#token = token;
  }

  static async fetchCall(
    resource: RequestInfo,
    options?: RequestInit | undefined
  ) {
    const req = new Request(resource, options);

    if (this.#token == '') {
      this.setToken(await token());
    }

    if (this.#token) {
      req.headers.set('Authorization', 'Bearer ' + this.#token);
      return fetch(req);
    }
  }
}
