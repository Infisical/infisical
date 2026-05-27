export class CertificateRequestCancelledError extends Error {
  constructor(message = "Certificate request was cancelled before persistence") {
    super(message);
    this.name = "CertificateRequestCancelledError";
  }
}
