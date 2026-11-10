import { jwtDecode } from "jwt-decode";
import {
  ArrowDownZAIcon,
  ArrowUpAZIcon,
  CalendarArrowDownIcon,
  CalendarArrowUpIcon,
  ClockArrowDownIcon,
  ClockArrowUpIcon
} from "lucide-react";

import { DashboardSecretsOrderBy } from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { getAuthToken } from "@app/hooks/api/reactQuery";

// Identifies the signed-in session and organization. Refreshing the access token, here or in
// another tab, replaces the token but keeps these claims. Signing in again from the same browser
// reuses the token session, so accessVersion, which logout increments, is what tells them apart.
export const getAuthSessionMarker = () => {
  try {
    const { userId, tokenVersionId, accessVersion, organizationId, subOrganizationId } = jwtDecode<{
      userId?: string;
      tokenVersionId?: string;
      accessVersion?: number;
      organizationId?: string;
      subOrganizationId?: string;
    }>(getAuthToken());
    return JSON.stringify([
      userId,
      tokenVersionId,
      accessVersion,
      organizationId,
      subOrganizationId
    ]);
  } catch {
    return null;
  }
};

// Every overview row type is rendered into the same TableBody, so their React keys share one
// namespace. Resource names are arbitrary user input, so a string prefix cannot separate them: a
// proxied service named "foo" and a secret named "ps-foo" both produce "overview-ps-foo". Encoding
// the row type and the name as a JSON array instead is injective, because JSON.stringify escapes
// the separators and quotes it emits, so two rows collide only when their type and name are equal.
export const overviewRowKey = (rowType: string, ...parts: (string | number)[]) =>
  JSON.stringify([rowType, ...parts]);

export const getSecretSortValue = (
  orderBy: DashboardSecretsOrderBy,
  orderDirection: OrderByDirection
) => `${orderBy}:${orderDirection}`;

export const SECRET_SORT_OPTIONS = [
  {
    label: "Name (A to Z)",
    Icon: ArrowUpAZIcon,
    orderBy: DashboardSecretsOrderBy.Name,
    orderDirection: OrderByDirection.ASC
  },
  {
    label: "Name (Z to A)",
    Icon: ArrowDownZAIcon,
    orderBy: DashboardSecretsOrderBy.Name,
    orderDirection: OrderByDirection.DESC
  },
  {
    label: "Last Edited (New)",
    Icon: ClockArrowUpIcon,
    orderBy: DashboardSecretsOrderBy.UpdatedAt,
    orderDirection: OrderByDirection.DESC
  },
  {
    label: "Last Edited (Old)",
    Icon: ClockArrowDownIcon,
    orderBy: DashboardSecretsOrderBy.UpdatedAt,
    orderDirection: OrderByDirection.ASC
  },
  {
    label: "Created (New)",
    Icon: CalendarArrowUpIcon,
    orderBy: DashboardSecretsOrderBy.CreatedAt,
    orderDirection: OrderByDirection.DESC
  },
  {
    label: "Created (Old)",
    Icon: CalendarArrowDownIcon,
    orderBy: DashboardSecretsOrderBy.CreatedAt,
    orderDirection: OrderByDirection.ASC
  }
] as const;
