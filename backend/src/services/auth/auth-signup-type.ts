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

// Keep old type as alias for any remaining references
export type TCompleteAccountSignupDTO = TCompleteAccountEmail;
