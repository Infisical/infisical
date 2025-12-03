import {
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useProject } from "@app/context";
import {
  TCertificateProfileWithDetails,
  useListCertificateProfiles
} from "@app/hooks/api/certificateProfiles";

import { ProfileRow } from "./ProfileRow";

interface Props {
  onEditProfile: (profile: TCertificateProfileWithDetails) => void;
  onDeleteProfile: (profile: TCertificateProfileWithDetails) => void;
  onRevealProfileAcmeEabSecret: (profile: TCertificateProfileWithDetails) => void;
}

export const ProfileList = ({
  onEditProfile,
  onRevealProfileAcmeEabSecret,
  onDeleteProfile
}: Props) => {
  const { currentProject } = useProject();

  const { data, isLoading } = useListCertificateProfiles({
    projectId: currentProject?.id || "",
    limit: 100,
    offset: 0,
    includeConfigs: true
  });

  const profiles = data?.certificateProfiles || [];

  if (!currentProject?.id) {
    return (
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Enrollment Method</Th>
              <Th>Issuing CA</Th>
              <Th>Certificate Template</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            <Tr>
              <Td colSpan={5}>
                <EmptyState title="No Project Selected" />
              </Td>
            </Tr>
          </TBody>
        </Table>
      </TableContainer>
    );
  }

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Enrollment Method</Th>
            <Th>Issuing CA</Th>
            <Th>Certificate Template</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={5} innerKey="certificate-profiles" />}
          {!isLoading && (!profiles || profiles.length === 0) && (
            <Tr>
              <Td colSpan={5}>
                <EmptyState title="No Certificate Profiles" />
              </Td>
            </Tr>
          )}
          {!isLoading &&
            profiles &&
            profiles.length > 0 &&
            profiles.map((profile) => (
              <ProfileRow
                key={profile.id}
                profile={profile}
                onEditProfile={onEditProfile}
                onRevealProfileAcmeEabSecret={onRevealProfileAcmeEabSecret}
                onDeleteProfile={onDeleteProfile}
              />
            ))}
        </TBody>
      </Table>
    </TableContainer>
  );
};
