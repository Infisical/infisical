import { useQueries } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import {
  certificateProfileKeys,
  fetchCertificateProfileById
} from "@app/hooks/api/certificateProfiles";
import { useListPkiApplications } from "@app/hooks/api/pkiApplications";

const SCOPE_IDS_LIMIT = 100;

export const useCertificateScopeNames = ({
  applicationIds,
  profileIds
}: {
  applicationIds: string[];
  profileIds: string[];
}) => {
  const { data: applicationsData, isFetched: isApplicationsFetched } = useListPkiApplications(
    { limit: SCOPE_IDS_LIMIT, applicationIds },
    { enabled: applicationIds.length > 0 }
  );
  const profileQueries = useQueries({
    queries: profileIds.map((profileId) => ({
      queryKey: certificateProfileKeys.getById(profileId),
      queryFn: () => fetchCertificateProfileById(profileId),
      retry: false
    }))
  });

  const applicationNames = new Map(
    (applicationsData?.applications ?? []).map(({ id, name }) => [id, name])
  );
  const profileNames = new Map(
    profileQueries.flatMap((query, index) =>
      query.data ? [[profileIds[index], query.data.slug] as const] : []
    )
  );
  const deletedProfileIds = new Set(
    profileQueries.flatMap((query, index) =>
      isAxiosError(query.error) && query.error.response?.status === 404 ? [profileIds[index]] : []
    )
  );

  return {
    getApplicationName: (id: string) =>
      applicationNames.get(id) ?? (isApplicationsFetched ? "Deleted application" : id),
    getProfileName: (id: string) =>
      profileNames.get(id) ?? (deletedProfileIds.has(id) ? "Deleted profile" : id)
  };
};
