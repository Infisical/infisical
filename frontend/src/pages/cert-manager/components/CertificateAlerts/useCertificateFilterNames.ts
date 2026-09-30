import { MAX_CERTIFICATE_ALERT_FILTER_IDS } from "@app/hooks/api/alerts";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import { useListPkiApplications } from "@app/hooks/api/pkiApplications";

export const useCertificateFilterNames = ({
  applicationIds,
  profileIds
}: {
  applicationIds: string[];
  profileIds: string[];
}) => {
  const applicationsQuery = useListPkiApplications(
    { limit: MAX_CERTIFICATE_ALERT_FILTER_IDS, applicationIds },
    { enabled: applicationIds.length > 0 }
  );
  const profilesQuery = useListCertificateProfiles({
    limit: MAX_CERTIFICATE_ALERT_FILTER_IDS,
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
      (isApplicationsLoaded && requestedApplicationIds.has(id) ? "Unknown application" : id),
    getProfileName: (id: string) =>
      profileNames.get(id) ??
      (isProfilesLoaded && requestedProfileIds.has(id) ? "Unknown profile" : id)
  };
};
