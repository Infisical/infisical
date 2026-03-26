export type DomainSsoConnector = {
  id: string;
  domain: string;
  ownerOrgId: string;
  verificationStatus: "pending" | "verified";
  verificationToken: string;
  verifiedAt: string | null;
  type: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClaimDomainDTO = {
  domain: string;
  type: string;
};

export type VerifyDomainDTO = {
  connectorId: string;
};

export type TakeoverDomainDTO = {
  connectorId: string;
};

export type DeleteDomainConnectorDTO = {
  connectorId: string;
};
