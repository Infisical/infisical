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
  const { data: applicationsData, isSuccess: isApplicationsLoaded } = useListPkiApplications(
    { limit: SCOPE_IDS_LIMIT, applicationIds },
    { enabled: applicationIds.length > 0 }
  );
  const { data: profilesData, isSuccess: isProfilesLoaded } = useListCertificateProfiles({
    limit: SCOPE_IDS_LIMIT,
    profileIds,
    enabled: profileIds.length > 0
  });

  const applicationNames = new Map(
    (applicationsData?.applications ?? []).map(({ id, name }) => [id, name])
  );
  const profileNames = new Map(
    (profilesData?.certificateProfiles ?? []).map(({ id, slug }) => [id, slug])
  );

  return {
    getApplicationName: (id: string) =>
      applicationNames.get(id) ?? (isApplicationsLoaded ? "Deleted application" : id),
    getProfileName: (id: string) =>
      profileNames.get(id) ?? (isProfilesLoaded ? "Deleted profile" : id)
  };
};
