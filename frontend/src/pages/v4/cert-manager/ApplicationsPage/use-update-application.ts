import { useMatch, useNavigate } from "@tanstack/react-router";

import type { TUpdatePkiApplicationDTO } from "@app/hooks/api/pkiApplications/types";

import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";

const detailRouteId = v4Path("/organizations/$orgId/cert-manager/applications/$applicationName");

export const useUpdateApplication = () => {
  const update = useV4Adapter("pkiApplications").useUpdateApplication();
  const navigate = useNavigate();
  const detail = useMatch({ from: detailRouteId, shouldThrow: false });

  return async (dto: TUpdatePkiApplicationDTO) => {
    const updated = await update.mutateAsync(dto);
    if (detail && updated.name !== detail.params.applicationName)
      await navigate({
        to: detailRouteId,
        params: { ...detail.params, applicationName: updated.name },
        search: detail.search,
        replace: true
      });
    return updated;
  };
};
