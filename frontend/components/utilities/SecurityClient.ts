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
      try {
        // TODO: This should be moved to a context to do it only once when app loads
        // this try catch saves route guard from a stuck state
        this.setToken(await token());
      } catch (error) {
        console.error("Unauthorized access");
      }
    }

    if (this.#token) {
      req.headers.set('Authorization', 'Bearer ' + this.#token);
    }

    return fetch(req);
  }
}
