import { QueryClient } from "@tanstack/react-query";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { organizationKeys } from "@app/hooks/api/organization/queries";
import { subOrganizationsQuery } from "@app/hooks/api/subOrganizations";

// select-organization answers 403 for enforced SSO as well as for revoked membership, so the
// error name is the only thing that tells them apart
const isOrgAccessRevokedError = (error: unknown) =>
  axios.isAxiosError<{ error?: string }>(error) &&
  error.response?.status === 403 &&
  error.response.data?.error === "OrgAccessRevoked";

export const refreshOrgListsOnAccessRevoked = async (queryClient: QueryClient, error: unknown) => {
  if (!isOrgAccessRevokedError(error)) return;

  await Promise.all([
    // exact: the ["organization"] prefix also matches getOrgById, which is unrelated here
    queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations, exact: true }),
    queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizationsWithSubOrgs }),
    queryClient.invalidateQueries({ queryKey: subOrganizationsQuery.allKey() })
  ]);
};

export const notifyOrgSelectionFailed = (error: unknown, organizationName?: string) => {
  if (!axios.isAxiosError<{ message?: string }>(error)) {
    // An expired session rejects with a plain Error after the request interceptor has already
    // toasted "Session Expired", so a toast here would contradict it
    console.error(error);
    return;
  }

  if (isOrgAccessRevokedError(error)) {
    createNotification({
      text: organizationName
        ? `You no longer have access to "${organizationName}". Ask an organization admin to re-invite you.`
        : "You no longer have access to this organization. Ask an organization admin to re-invite you.",
      type: "error"
    });
    return;
  }

  createNotification({
    text:
      error.response?.data?.message ||
      "Could not switch organization. Try again, or reload the page.",
    type: "error"
  });
};
