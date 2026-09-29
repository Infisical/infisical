import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import { useListPkiApplications } from "@app/hooks/api/pkiApplications";

const SCOPE_IDS_LIMIT = 100;

export const useCertificateScopeNames = ({
  applicationIds,
  profileIds
}: {
  applicationIds: string[];
  profileIds: string[];
}) => {
  const applicationsQuery = useListPkiApplications(
    { limit: SCOPE_IDS_LIMIT, applicationIds },
    { enabled: applicationIds.length > 0 }
  );
  const profilesQuery = useListCertificateProfiles({
    limit: SCOPE_IDS_LIMIT,
    profileIds,
    enabled: profileIds.length > 0
  });
  const isApplicationsLoaded = applicationsQuery.isSuccess && !applicationsQuery.isPlaceholderData;
  const isProfilesLoaded = profilesQuery.isSuccess && !profilesQuery.isPlaceholderData;

  const applicationNames = new Map(
    (applicationsQuery.data?.applications ?? []).map(({ id, name }) => [id, name])
  );
  const profileNames = new Map(
    (profilesQuery.data?.certificateProfiles ?? []).map(({ id, slug }) => [id, slug])
  );

  const requestedApplicationIds = new Set(applicationIds);
  const requestedProfileIds = new Set(profileIds);

  return {
    getApplicationName: (id: string) =>
      applicationNames.get(id) ??
      (isApplicationsLoaded && requestedApplicationIds.has(id) ? "Deleted application" : id),
    getProfileName: (id: string) =>
      profileNames.get(id) ??
      (isProfilesLoaded && requestedProfileIds.has(id) ? "Deleted profile" : id)
  };
};
