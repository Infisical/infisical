import { IdentityMembershipOrg } from "@app/hooks/api/identities/types";

export type Organization = {
  id: string;
  name: string;
  createAt: string;
  updatedAt: string;
  authEnforced: boolean;
  scimEnabled: boolean;
  slug: string;
};

export type UpdateOrgDTO = {
  orgId: string;
  name?: string;
  authEnforced?: boolean;
  scimEnabled?: boolean;
  slug?: string;
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
  id: string;
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
  orderBy?: string;
  direction?: string;
  textFilter?: string;
};

export type TOrgIdentitiesList = {
  identityMemberships: IdentityMembershipOrg[];
  totalCount: number;
};
