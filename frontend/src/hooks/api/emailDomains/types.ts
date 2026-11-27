export type TEmailDomain = {
  id: string;
  orgId: string;
  domain: string;
  verificationRecord: {
    type: "TXT";
    name: string;
    value: string;
  };
  status: "pending" | "verified" | "expired";
  verifiedAt: string | null;
  codeExpiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TCreateEmailDomainDTO = {
  domain: string;
};

export type TVerifyEmailDomainDTO = {
  emailDomainId: string;
};

export type TDeleteEmailDomainDTO = {
  emailDomainId: string;
};
