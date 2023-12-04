export enum TokenType {
  TOKEN_EMAIL_CONFIRMATION = "emailConfirmation",
  TOKEN_EMAIL_MFA = "emailMfa",
  TOKEN_EMAIL_ORG_INVITATION = "organizationInvitation",
  TOKEN_EMAIL_PASSWORD_RESET = "passwordReset"
}

export type TCreateTokenForUserDTO = {
  type: TokenType;
  userId: string;
};

export type TValidateTokenForUserDTO = {
  type: TokenType;
  code: string;
  userId: string;
};

export type TUpsertTokenForUserDalDTO = {
  type: TokenType;
  expiresAt: Date;
  userId: string;
  tokenHash: string;
  triesLeft?: number;
};

export type TGetTokenForUserDalDTO = {
  userId: string;
  type: TokenType;
};

export type TDeleteTokenForUserDalDTO = {
  userId: string;
  type: TokenType;
};

export type TIssueAuthTokenDTO = {
  userId: string;
  ip: string;
  userAgent: string;
};
