export type TCompleteAccountSignupDTO = {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  organizationName?: string;
  providerAuthToken?: string | null;
  attributionSource?: string | undefined;
  ip: string;
  userAgent: string;
  authorization: string;
  useDefaultOrg?: boolean;
};

export type TCompleteAccountInviteDTO = {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  ip: string;
  userAgent: string;
  authorization: string;
  tokenMetadata?: string;
};
