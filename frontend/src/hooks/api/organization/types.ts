import { OrderByDirection } from "@app/hooks/api/generic/types";
import { IdentityMembershipOrg } from "@app/hooks/api/identities/types";

import { MfaMethod } from "../auth/types";

export type Organization = {
  id: string;
  name: string;
  createAt: string;
  updatedAt: string;
  authEnforced: boolean;
  googleSsoAuthEnforced: boolean;
  bypassOrgAuthEnabled: boolean;
  orgAuthMethod: string;
  scimEnabled: boolean;
  slug: string;
  defaultMembershipRole: string;
  enforceMfa: boolean;
  selectedMfaMethod?: MfaMethod;
  shouldUseNewPrivilegeSystem: boolean;
  allowSecretSharingOutsideOrganization?: boolean;
  userTokenExpiration?: string;
  userRole: string;
  secretsProductEnabled: boolean;
  pkiProductEnabled: boolean;
  kmsProductEnabled: boolean;
  sshProductEnabled: boolean;
  scannerProductEnabled: boolean;
  shareSecretsProductEnabled: boolean;
  maxSharedSecretLifetime: number;
  maxSharedSecretViewLimit: number | null;
  blockDuplicateSecretSyncDestinations: boolean;
  parentOrgId: string | null;
  rootOrgId: string | null;
};

export type UpdateOrgDTO = {
  orgId: string;
  name?: string;
  authEnforced?: boolean;
  googleSsoAuthEnforced?: boolean;
  scimEnabled?: boolean;
  slug?: string;
  defaultMembershipRoleSlug?: string;
  enforceMfa?: boolean;
  selectedMfaMethod?: MfaMethod;
  allowSecretSharingOutsideOrganization?: boolean;
  bypassOrgAuthEnabled?: boolean;
  userTokenExpiration?: string;
  secretsProductEnabled?: boolean;
  pkiProductEnabled?: boolean;
  kmsProductEnabled?: boolean;
  sshProductEnabled?: boolean;
  scannerProductEnabled?: boolean;
  shareSecretsProductEnabled?: boolean;
  maxSharedSecretViewLimit?: number | null;
  maxSharedSecretLifetime?: number;
  blockDuplicateSecretSyncDestinations?: boolean;
};

export type BillingDetails = {
  name: string;
  email: string;
};

export type PlanBillingInfo = {
  amount: number;
  currentPeriodEnd: number;
  currentPeriodStart: number;
  interval: "month" | "year";
  intervalCount: number;
  quantity: number;
  users: number;
  identities: number;
};

export type Invoice = {
  id: string;
  created: number;
  invoice_pdf: string;
  number: string;
  paid: boolean;
  total: number;
};

export type PmtMethod = {
  _id: string;
  brand: string;
  exp_month: number;
  exp_year: number;
  funding: string;
  last4: string;
};

export type TaxID = {
  id: string;
  country: string;
  type: string;
  value: string;
};

export type License = {
  id: string;
  customerId: string;
  prefix: string;
  licenseKey: string;
  isActivated: boolean;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type OrgPlanTableHead = {
  name: string;
};

export type OrgPlanTableRow = {
  name: string;
  allowed: number | boolean | null;
  used: string;
};

export type OrgPlanTable = {
  head: OrgPlanTableHead[];
  rows: OrgPlanTableRow[];
  productRows: Record<string, OrgPlanTableRow[]>;
};

export type ProductsTableHead = {
  name: string;
  price: number | null;
  priceLine: string;
  productId: string;
  slug: string;
  tier: number;
};

export type ProductsTableRow = {
  name: string;
  starter: number | boolean | null;
  team: number | boolean | null;
  pro: number | boolean | null;
  enterprise: number | boolean | null;
};

export type ProductsTable = {
  head: ProductsTableHead[];
  rows: ProductsTableRow[];
};

export type TListOrgIdentitiesDTO = {
  organizationId: string;
  offset?: number;
  limit?: number;
  orderBy?: OrgIdentityOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export type TOrgIdentitiesList = {
  identityMemberships: IdentityMembershipOrg[];
  totalCount: number;
};

export enum OrgIdentityOrderBy {
  Name = "name",
  Role = "role"
}

export enum OrgMembershipStatus {
  Invited = "invited",
  Accepted = "accepted"
}

export type TBillingMetrics = {
  identityMetrics: Record<string, { userCount: number; identityCount: number }>;
  certificateMetrics: { sanCount: number; wildcardCount: number };
  quantity: number;
  quantityIdentities: number;
  usedCertManagerCas: number;
};
