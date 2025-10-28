/**
 * ACME Error Classes based on RFC 8555 Section 6.2
 * https://datatracker.ietf.org/doc/html/rfc8555#section-6.2
 */

export interface IAcmeError {
  type: string;
  detail: string;
  status: number;
  subproblems?: Array<{ type: string; detail: string; identifier?: { type: string; value: string } }>;
}

export class AcmeError extends Error implements IAcmeError {
  type: string;

  detail: string;

  status: number;

  subproblems?: Array<{ type: string; detail: string; identifier?: { type: string; value: string } }>;

  error?: unknown;

  constructor({
    type,
    detail,
    status,
    subproblems,
    error,
    message
  }: {
    type: string;
    detail: string;
    status: number;
    subproblems?: Array<{ type: string; detail: string; identifier?: { type: string; value: string } }>;
    error?: unknown;
    message?: string;
  }) {
    super(message || detail);
    this.type = type;
    this.detail = detail;
    this.status = status;
    this.subproblems = subproblems;
    this.error = error;
    this.name = "AcmeError";
  }

  toAcmeResponse(): IAcmeError {
    return {
      type: this.type,
      detail: this.detail,
      status: this.status,
      subproblems: this.subproblems
    };
  }
}

/**
 * malformed - The request message was malformed (RFC 8555 Section 6.7.1)
 */
export class AcmeMalformedError extends AcmeError {
  constructor({
    detail = "The request message was malformed",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "malformed",
      detail,
      status: 400,
      error,
      message
    });
    this.name = "AcmeMalformedError";
  }
}

/**
 * unauthorized - The client lacks sufficient authorization (RFC 8555 Section 6.7.2)
 */
export class AcmeUnauthorizedError extends AcmeError {
  constructor({
    detail = "The client lacks sufficient authorization",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "unauthorized",
      detail,
      status: 403,
      error,
      message
    });
    this.name = "AcmeUnauthorizedError";
  }
}

/**
 * accountDoesNotExist - The request specified an account that does not exist
 * (RFC 8555 Section 6.7.3)
 */
export class AcmeAccountDoesNotExistError extends AcmeError {
  constructor({
    detail = "The request specified an account that does not exist",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "accountDoesNotExist",
      detail,
      status: 400,
      error,
      message
    });
    this.name = "AcmeAccountDoesNotExistError";
  }
}

/**
 * badNonce - The client sent an unacceptable anti-replay nonce (RFC 8555 Section 6.7.4)
 */
export class AcmeBadNonceError extends AcmeError {
  constructor({
    detail = "The client sent an unacceptable anti-replay nonce",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "badNonce",
      detail,
      status: 400,
      error,
      message
    });
    this.name = "AcmeBadNonceError";
  }
}

/**
 * badSignature - The JWS signature is invalid (RFC 8555 Section 6.7.5)
 */
export class AcmeBadSignatureError extends AcmeError {
  constructor({
    detail = "The JWS signature is invalid",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "badSignature",
      detail,
      status: 401,
      error,
      message
    });
    this.name = "AcmeBadSignatureError";
  }
}

/**
 * badPublicKey - The public key is not acceptable (RFC 8555 Section 6.7.6)
 */
export class AcmeBadPublicKeyError extends AcmeError {
  constructor({
    detail = "The public key is not acceptable",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "badPublicKey",
      detail,
      status: 400,
      error,
      message
    });
    this.name = "AcmeBadPublicKeyError";
  }
}

/**
 * badCSR - The CSR is unacceptable (RFC 8555 Section 6.7.7)
 */
export class AcmeBadCsrError extends AcmeError {
  constructor({
    detail = "The CSR is unacceptable",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "badCSR",
      detail,
      status: 400,
      error,
      message
    });
    this.name = "AcmeBadCsrError";
  }
}

/**
 * badRevocationReason - The revocation reason provided is not allowed
 * (RFC 8555 Section 6.7.8)
 */
export class AcmeBadRevocationReasonError extends AcmeError {
  constructor({
    detail = "The revocation reason provided is not allowed",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "badRevocationReason",
      detail,
      status: 400,
      error,
      message
    });
    this.name = "AcmeBadRevocationReasonError";
  }
}

/**
 * rateLimited - The client has exceeded a rate limit (RFC 8555 Section 6.7.9)
 */
export class AcmeRateLimitedError extends AcmeError {
  constructor({
    detail = "The client has exceeded a rate limit",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "rateLimited",
      detail,
      status: 429,
      error,
      message
    });
    this.name = "AcmeRateLimitedError";
  }
}

/**
 * rejectedIdentifier - The server will not issue certificates for the identifier
 * (RFC 8555 Section 6.7.10)
 */
export class AcmeRejectedIdentifierError extends AcmeError {
  constructor({
    detail = "The server will not issue certificates for the identifier",
    subproblems,
    error,
    message
  }: {
    detail?: string;
    subproblems?: Array<{ type: string; detail: string; identifier?: { type: string; value: string } }>;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "rejectedIdentifier",
      detail,
      status: 400,
      subproblems,
      error,
      message
    });
    this.name = "AcmeRejectedIdentifierError";
  }
}

/**
 * serverInternal - An internal error occurred (RFC 8555 Section 6.7.11)
 */
export class AcmeServerInternalError extends AcmeError {
  constructor({
    detail = "An internal error occurred",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "serverInternal",
      detail,
      status: 500,
      error,
      message
    });
    this.name = "AcmeServerInternalError";
  }
}

/**
 * serviceUnavailable - The service is unavailable (RFC 8555 Section 6.7.12)
 */
export class AcmeServiceUnavailableError extends AcmeError {
  constructor({
    detail = "The service is unavailable",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "serviceUnavailable",
      detail,
      status: 503,
      error,
      message
    });
    this.name = "AcmeServiceUnavailableError";
  }
}

/**
 * unsupportedContact - A contact URL is of an unsupported type (RFC 8555 Section 6.7.13)
 */
export class AcmeUnsupportedContactError extends AcmeError {
  constructor({
    detail = "A contact URL is of an unsupported type",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "unsupportedContact",
      detail,
      status: 400,
      error,
      message
    });
    this.name = "AcmeUnsupportedContactError";
  }
}

/**
 * unsupportedIdentifier - An identifier is of an unsupported type
 * (RFC 8555 Section 6.7.14)
 */
export class AcmeUnsupportedIdentifierError extends AcmeError {
  constructor({
    detail = "An identifier is of an unsupported type",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "unsupportedIdentifier",
      detail,
      status: 400,
      error,
      message
    });
    this.name = "AcmeUnsupportedIdentifierError";
  }
}

/**
 * userActionRequired - Visit the "instance" URL and take actions specified there
 * (RFC 8555 Section 6.7.15)
 */
export class AcmeUserActionRequiredError extends AcmeError {
  instance?: string;

  constructor({
    detail = "Visit the instance URL and take actions specified there",
    instance,
    error,
    message
  }: {
    detail?: string;
    instance?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: "userActionRequired",
      detail,
      status: 403,
      error,
      message
    });
    this.instance = instance;
    this.name = "AcmeUserActionRequiredError";
  }

  toAcmeResponse(): IAcmeError & { instance?: string } {
    return {
      ...super.toAcmeResponse(),
      instance: this.instance
    };
  }
}
