import token from "../../pages/api/auth/Token"
import { PATH } from '../../const';

export default class SecurityClient {
    static authOrigins = [PATH]
    static #token = '';

    contructor() {

    }

    static setToken(token) {
        this.#token = token;
    }

    static async fetchCall(resource, options) {
        let req = new Request(resource, options);
        const destOrigin = new URL(req.url).origin;

        if (this.#token == "") {
            this.setToken(await token())
        }

        if (this.#token && this.authOrigins.includes(destOrigin)) {
            req.headers.set('Authorization', "Bearer " + this.#token);
            return fetch(req);
        } 
    }
}