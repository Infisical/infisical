import { ProjectMembershipRole } from "@app/db/schemas";

export enum TokenType {
  TOKEN_EMAIL_CONFIRMATION = "emailConfirmation",
  TOKEN_EMAIL_VERIFICATION = "emailVerification", // unverified -> verified
  TOKEN_EMAIL_CHANGE_OTP = "emailChangeOtp",
  TOKEN_EMAIL_MFA = "emailMfa",
  TOKEN_EMAIL_ORG_INVITATION = "organizationInvitation",
  TOKEN_EMAIL_PASSWORD_RESET = "passwordReset",
  TOKEN_EMAIL_PASSWORD_SETUP = "passwordSetup",
  TOKEN_USER_UNLOCK = "userUnlock",
  TOKEN_WEBAUTHN_SESSION = "webauthnSession"
}

export type TCreateTokenForUserDTO = {
  type: TokenType;
  userId: string;
  orgId?: string;
  aliasId?: string;
  payload?: string;
};

export type TCreateOrgInviteTokenDTO = {
  userId: string;
  orgId: string;
};

export type TValidateTokenForUserDTO = {
  type: TokenType;
  code: string;
  userId: string;
  orgId?: string;
};

export type TUpsertTokenForUserDALDTO = {
  type: TokenType;
  expiresAt: Date;
  userId: string;
  tokenHash: string;
  triesLeft?: number;
};

export type TGetTokenForUserDALDTO = {
  userId: string;
  type: TokenType;
};

export type TDeleteTokenForUserDALDTO = {
  userId: string;
  type: TokenType;
  orgId: string | null;
};

export type TIssueAuthTokenDTO = {
  userId: string;
  ip: string;
  userAgent: string;
};

export enum TokenMetadataType {
  InviteToProjects = "projects-invite"
}

export type TTokenInviteToProjectsMetadataPayload = {
  projectIds: string[];
  projectRoleSlug: ProjectMembershipRole;
  userId: string;
  orgId: string;
};

export type TTokenMetadata = {
  type: TokenMetadataType.InviteToProjects;
  payload: TTokenInviteToProjectsMetadataPayload;
};
