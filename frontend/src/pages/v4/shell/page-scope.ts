import type { PageHeaderScope } from "@infisical/cipher/ui/page-header";

import { useV4Session } from "../data/session/contract";

export const useOrgPageScope = (): PageHeaderScope | undefined =>
  useV4Session().organization.isSubOrganization ? { label: "Sub-organization" } : undefined;
