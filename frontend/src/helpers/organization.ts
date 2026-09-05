import { QueryClient } from "@tanstack/react-query";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import {
  fetchOrganizationsWithSubOrgs,
  organizationKeys
} from "@app/hooks/api/organization/queries";
import { subOrganizationsQuery } from "@app/hooks/api/subOrganizations";

// Returns false having already reported the reason, so callers only branch on the result. Fails
// closed: a switch is retryable, the session it would destroy is not.
export const verifyOrgStillAccessible = async (
  queryClient: QueryClient,
  organization: { id: string; name: string }
) => {
  let accessibleOrgs;

  try {
    accessibleOrgs = await queryClient.fetchQuery({
      queryKey: organizationKeys.getUserOrganizationsWithSubOrgs,
      queryFn: fetchOrganizationsWithSubOrgs,
      // without this the 60s global staleTime answers from the same cache we are trying to distrust
      staleTime: 0
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      createNotification({
        text: `Could not confirm your access to "${organization.name}". Try again, or reload the page.`,
        type: "error"
      });
    } else {
      // An expired session rejects with a plain Error after the request interceptor has already
      // toasted "Session Expired", so a toast here would contradict it
      console.error(error);
    }

    return false;
  }

  // Presence is not enough: a deactivated membership still lists the org (that is what the
  // Inactive badge reads), and select-organization refuses it, so treat it as inaccessible rather
  // than destroying the session for it. `!== false` so an older deployment that omits the field
  // still permits the switch.
  const isAccessible = accessibleOrgs.some((org) => {
    if (org.id === organization.id) return org.isActive !== false;

    return org.subOrganizations.some(
      (subOrg) => subOrg.id === organization.id && subOrg.isActive !== false
    );
  });

  if (isAccessible) return true;

  createNotification({
    text: `You no longer have access to "${organization.name}". Ask an organization admin to restore your access.`,
    type: "error"
  });

  await Promise.all([
    // exact: the ["organization"] prefix also matches getOrgById, which is unrelated here
    queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations, exact: true }),
    queryClient.invalidateQueries({ queryKey: subOrganizationsQuery.allKey() })
  ]);

  return false;
};
