export class WebProtocolError extends Error {
  constructor() {
    super("The browser connection sent an invalid message.");
  }
}
