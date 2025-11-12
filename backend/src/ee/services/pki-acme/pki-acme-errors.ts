/**
 * ACME Error Classes based on RFC 8555 Section 6.7
 * https://datatracker.ietf.org/doc/html/rfc8555#section-6.7
 */

/* eslint-disable max-classes-per-file */

// RFC 8555 Section 6.7 - Error Types
export enum AcmeErrorType {
  AccountDoesNotExist = "accountDoesNotExist",
  AlreadyRevoked = "alreadyRevoked",
  BadCsr = "badCSR",
  BadNonce = "badNonce",
  BadPublicKey = "badPublicKey",
  BadRevocationReason = "badRevocationReason",
  BadSignatureAlgorithm = "badSignatureAlgorithm",
  CAA = "caa",
  Compound = "compound",
  Connection = "connection",
  DNS = "dns",
  ExternalAccountRequired = "externalAccountRequired",
  IncorrectResponse = "incorrectResponse",
  InvalidContact = "invalidContact",
  Malformed = "malformed",
  OrderNotReady = "orderNotReady",
  RateLimited = "rateLimited",
  RejectedIdentifier = "rejectedIdentifier",
  ServerInternal = "serverInternal",
  TLS = "tls",
  Unauthorized = "unauthorized",
  UnsupportedContact = "unsupportedContact",
  UnsupportedIdentifier = "unsupportedIdentifier",
  UserActionRequired = "userActionRequired"
}

export interface IAcmeError {
  type: AcmeErrorType;
  message: string;
  status: number;
  subproblems?: Array<{ type: string; detail: string; identifier?: { type: string; value: string } }>;
}

export class AcmeError extends Error implements IAcmeError {
  type: AcmeErrorType;

  message: string;

  status: number;

  subproblems?: Array<{ type: string; detail: string; identifier?: { type: string; value: string } }>;

  error?: unknown;

  constructor({
    type,
    message,
    status,
    subproblems,
    error
  }: {
    type: AcmeErrorType;
    message: string;
    status: number;
    subproblems?: Array<{ type: string; detail: string; identifier?: { type: string; value: string } }>;
    error?: unknown;
  }) {
    super(message);
    this.type = type;
    this.message = message;
    this.status = status;
    this.subproblems = subproblems;
    this.error = error;
    this.name = "AcmeError";
  }

  toAcmeResponse(): IAcmeError {
    return {
      type: this.type,
      message: this.message,
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
    message = "The request message was malformed",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.Malformed,
      message,
      status: 400,
      error
    });
    this.name = "AcmeMalformedError";
  }
}

/**
 * unauthorized - The client lacks sufficient authorization (RFC 8555 Section 6.7.2)
 */
export class AcmeUnauthorizedError extends AcmeError {
  constructor({
    message = "The client lacks sufficient authorization",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.Unauthorized,
      message,
      status: 403,
      error
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
    message = "The request specified an account that does not exist",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.AccountDoesNotExist,
      message,
      status: 404,
      error
    });
    this.name = "AcmeAccountDoesNotExistError";
  }
}

/**
 * badNonce - The client sent an unacceptable anti-replay nonce (RFC 8555 Section 6.7.4)
 */
export class AcmeBadNonceError extends AcmeError {
  constructor({
    message = "The client sent an unacceptable anti-replay nonce",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.BadNonce,
      message,
      status: 400,
      error
    });
    this.name = "AcmeBadNonceError";
  }
}

/**
 * badSignatureAlgorithm - The signature algorithm is invalid (RFC 8555 Section 6.7.5)
 */
export class AcmeBadSignatureAlgorithmError extends AcmeError {
  constructor({
    message = "The signature algorithm is invalid",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.BadSignatureAlgorithm,
      message,
      status: 401,
      error
    });
    this.name = "AcmeBadSignatureAlgorithmError";
  }
}

/**
 * badPublicKey - The public key is not acceptable (RFC 8555 Section 6.7.6)
 */
export class AcmeBadPublicKeyError extends AcmeError {
  constructor({
    message = "The public key is not acceptable",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.BadPublicKey,
      message,
      status: 400,
      error
    });
    this.name = "AcmeBadPublicKeyError";
  }
}

/**
 * badCSR - The CSR is unacceptable (RFC 8555 Section 6.7.7)
 */
export class AcmeBadCsrError extends AcmeError {
  constructor({
    message = "The CSR is unacceptable",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.BadCsr,
      message,
      status: 400,
      error
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
    message = "The revocation reason provided is not allowed",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.BadRevocationReason,
      message,
      status: 400,
      error
    });
    this.name = "AcmeBadRevocationReasonError";
  }
}

/**
 * rateLimited - The client has exceeded a rate limit (RFC 8555 Section 6.7.9)
 */
export class AcmeRateLimitedError extends AcmeError {
  constructor({
    message = "The client has exceeded a rate limit",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.RateLimited,
      message,
      status: 429,
      error
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
    message = "The server will not issue certificates for the identifier",
    subproblems,
    error
  }: {
    message?: string;
    subproblems?: Array<{ type: string; detail: string; identifier?: { type: string; value: string } }>;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.RejectedIdentifier,
      message,
      status: 400,
      subproblems,
      error
    });
    this.name = "AcmeRejectedIdentifierError";
  }
}

/**
 * serverInternal - An internal error occurred (RFC 8555 Section 6.7.11)
 */
export class AcmeServerInternalError extends AcmeError {
  constructor({
    message = "An internal error occurred",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.ServerInternal,
      message,
      status: 500,
      error
    });
    this.name = "AcmeServerInternalError";
  }
}

/**
 * unsupportedContact - A contact URL is of an unsupported type (RFC 8555 Section 6.7.13)
 */
export class AcmeUnsupportedContactError extends AcmeError {
  constructor({
    message = "A contact URL is of an unsupported type",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.UnsupportedContact,
      message,
      status: 400,
      error
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
    message = "An identifier is of an unsupported type",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.UnsupportedIdentifier,
      message,
      status: 400,
      error
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
    message = "Visit the instance URL and take actions specified there",
    instance,
    error
  }: {
    message?: string;
    instance?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.UserActionRequired,
      message,
      status: 403,
      error
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

/**
 * incorrectResponse - The response is incorrect (RFC 8555 Section 6.7.16)
 */
export class AcmeIncorrectResponseError extends AcmeError {
  constructor({
    message = "The response is incorrect",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.IncorrectResponse,
      message,
      status: 400,
      error
    });
    this.name = "AcmeIncorrectResponseError";
  }
}

/**
 * connectionError - A connection error occurred (RFC 8555 Section 6.7.17)
 */
export class AcmeConnectionError extends AcmeError {
  constructor({
    message = "A connection error occurred",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.Connection,
      message,
      status: 400,
      error
    });
    this.name = "AcmeConnectionError";
  }
}

export class AcmeDnsFailureError extends AcmeError {
  constructor({
    message = "Hostname could not be resolved (DNS failure)",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.DNS,
      message,
      status: 400,
      error
    });
    this.name = "AcmeDnsFailureError";
  }
}

export class AcmeOrderNotReadyError extends AcmeError {
  constructor({
    message = "The order is not ready",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.OrderNotReady,
      message,
      status: 400,
      error
    });
    this.name = "AcmeOrderNotReadyError";
  }
}

export class AcmeBadCSRError extends AcmeError {
  constructor({
    message = "The CSR is unacceptable",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.BadCsr,
      message,
      status: 400,
      error
    });
    this.name = "AcmeBadCSRError";
  }
}

export class AcmeExternalAccountRequiredError extends AcmeError {
  constructor({
    message = "External account binding is required",
    error
  }: {
    message?: string;
    error?: unknown;
  } = {}) {
    super({
      type: AcmeErrorType.ExternalAccountRequired,
      message,
      status: 400,
      error
    });
    this.name = "AcmeExternalAccountRequiredError";
  }
}
