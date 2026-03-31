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
};
