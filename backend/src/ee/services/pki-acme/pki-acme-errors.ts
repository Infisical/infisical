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
  detail: string;
  status: number;
  subproblems?: Array<{ type: string; detail: string; identifier?: { type: string; value: string } }>;
}

export class AcmeError extends Error implements IAcmeError {
  type: AcmeErrorType;

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
    type: AcmeErrorType;
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
      type: AcmeErrorType.Malformed,
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
      type: AcmeErrorType.Unauthorized,
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
      type: AcmeErrorType.AccountDoesNotExist,
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
      type: AcmeErrorType.BadNonce,
      detail,
      status: 400,
      error,
      message
    });
    this.name = "AcmeBadNonceError";
  }
}

/**
 * badSignatureAlgorithm - The signature algorithm is invalid (RFC 8555 Section 6.7.5)
 */
export class AcmeBadSignatureAlgorithmError extends AcmeError {
  constructor({
    detail = "The signature algorithm is invalid",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: AcmeErrorType.BadSignatureAlgorithm,
      detail,
      status: 401,
      error,
      message
    });
    this.name = "AcmeBadSignatureAlgorithmError";
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
      type: AcmeErrorType.BadPublicKey,
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
      type: AcmeErrorType.BadCsr,
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
      type: AcmeErrorType.BadRevocationReason,
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
      type: AcmeErrorType.RateLimited,
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
      type: AcmeErrorType.RejectedIdentifier,
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
      type: AcmeErrorType.ServerInternal,
      detail,
      status: 500,
      error,
      message
    });
    this.name = "AcmeServerInternalError";
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
      type: AcmeErrorType.UnsupportedContact,
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
      type: AcmeErrorType.UnsupportedIdentifier,
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
      type: AcmeErrorType.UserActionRequired,
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

/**
 * incorrectResponse - The response is incorrect (RFC 8555 Section 6.7.16)
 */
export class AcmeIncorrectResponseError extends AcmeError {
  constructor({
    detail = "The response is incorrect",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: AcmeErrorType.IncorrectResponse,
      detail,
      status: 400,
      error,
      message
    });
    this.name = "AcmeIncorrectResponseError";
  }
}

/**
 * connectionError - A connection error occurred (RFC 8555 Section 6.7.17)
 */
export class AcmeConnectionError extends AcmeError {
  constructor({
    detail = "A connection error occurred",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: AcmeErrorType.Connection,
      detail,
      status: 400,
      error,
      message
    });
    this.name = "AcmeConnectionError";
  }
}

export class AcmeDnsFailureError extends AcmeError {
  constructor({
    detail = "Hostname could not be resolved (DNS failure)",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: AcmeErrorType.DNS,
      detail,
      status: 400,
      error,
      message
    });
    this.name = "AcmeDnsFailureError";
  }
}

export class AcmeOrderNotReadyError extends AcmeError {
  constructor({
    detail = "The order is not ready",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: AcmeErrorType.OrderNotReady,
      detail,
      status: 403,
      error,
      message
    });
    this.name = "AcmeOrderNotReadyError";
  }
}

export class AcmeBadCSRError extends AcmeError {
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
      type: AcmeErrorType.BadCsr,
      detail,
      status: 400,
      error,
      message
    });
    this.name = "AcmeBadCSRError";
  }
}

export class AcmeExternalAccountRequiredError extends AcmeError {
  constructor({
    detail = "External account binding is required",
    error,
    message
  }: {
    detail?: string;
    error?: unknown;
    message?: string;
  } = {}) {
    super({
      type: AcmeErrorType.ExternalAccountRequired,
      detail,
      status: 400,
      error,
      message
    });
    this.name = "AcmeExternalAccountRequiredError";
  }
}
