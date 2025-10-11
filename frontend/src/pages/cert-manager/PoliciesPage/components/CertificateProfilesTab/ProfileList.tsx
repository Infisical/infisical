import {
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useProject } from "@app/context";
import {
  TCertificateProfile,
  useListCertificateProfiles
} from "@app/hooks/api/certificateProfiles";

import { ProfileRow } from "./ProfileRow";

interface Props {
  onEditProfile: (profile: TCertificateProfile) => void;
  onDeleteProfile: (profile: TCertificateProfile) => void;
}

export const ProfileList = ({ onEditProfile, onDeleteProfile }: Props) => {
  const { currentProject } = useProject();

  const { data, isLoading } = useListCertificateProfiles({
    projectId: currentProject?.id || "",
    limit: 100,
    offset: 0,
    includeMetrics: true
  });

  const profiles = data?.certificateProfiles || [];

  if (isLoading) {
    return <TableSkeleton columns={6} innerKey="certificate-profiles" />;
  }

  if (!profiles || profiles.length === 0) {
    return <EmptyState title="No Certificate Profiles" />;
  }

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Enrollment Type</Th>
            <Th>Certificate Authority</Th>
            <Th>Template</Th>
            <Th>Certificates</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {profiles.map((profile) => (
            <ProfileRow
              key={profile.id}
              profile={profile}
              onEditProfile={onEditProfile}
              onDeleteProfile={onDeleteProfile}
            />
          ))}
        </TBody>
      </Table>
    </TableContainer>
  );
};
