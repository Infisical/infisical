export enum CompleteAccountType {
  Email = "email",
  Alias = "alias"
}

type TCompleteAccountBase = {
  ip: string;
  userAgent: string;
  authorization: string;
};

type TCompleteAccountEmail = TCompleteAccountBase & {
  type: CompleteAccountType.Email;
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  attributionSource?: string;
  organizationName?: string;
};

type TCompleteAccountAlias = TCompleteAccountBase & {
  type: CompleteAccountType.Alias;
  code: string;
};

export type TCompleteAccountDTO = TCompleteAccountEmail | TCompleteAccountAlias;

export type TRecordSignupOnboardingDTO = {
  userId: string;
  orgId: string;
  selectedProducts?: string[];
  launchDestination?: string;
  attributionSource?: string;
};

// Keep old type as alias for any remaining references
export type TCompleteAccountSignupDTO = TCompleteAccountEmail;
