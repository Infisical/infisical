import { QueryClient } from "@tanstack/react-query";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { organizationKeys } from "@app/hooks/api/organization/queries";
import { subOrganizationsQuery } from "@app/hooks/api/subOrganizations";

const isOrgAccessRevokedError = (error: unknown) =>
  axios.isAxiosError(error) && error.response?.status === 403;

export const evictOrgOnAccessRevoked = (queryClient: QueryClient, error: unknown) => {
  if (!isOrgAccessRevokedError(error)) return;

  // exact: the ["organization"] prefix also matches getOrgById, which must not be refetched here
  queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations, exact: true });
  queryClient.invalidateQueries({
    queryKey: organizationKeys.getUserOrganizationsWithSubOrgs,
    exact: true
  });
  queryClient.invalidateQueries({ queryKey: subOrganizationsQuery.allKey() });
};

export const notifyOrgSelectionFailed = (error: unknown, organizationName?: string) => {
  if (isOrgAccessRevokedError(error)) {
    createNotification({
      text: organizationName
        ? `You no longer have access to "${organizationName}".`
        : "You no longer have access to this organization.",
      type: "error"
    });
    return;
  }

  const serverMessage = axios.isAxiosError<{ message?: string }>(error)
    ? error.response?.data?.message
    : undefined;

  createNotification({
    text: serverMessage || "Failed to switch organization.",
    type: "error"
  });
};
