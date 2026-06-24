import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  TCertificateProfileWithDetails,
  useListCertificateProfiles
} from "@app/hooks/api/certificateProfiles";

import { ProfileRow } from "./ProfileRow";

interface Props {
  onEditProfile: (profile: TCertificateProfileWithDetails) => void;
  onCloneProfile: (profile: TCertificateProfileWithDetails) => void;
  onDeleteProfile: (profile: TCertificateProfileWithDetails) => void;
}

export const ProfileList = ({ onEditProfile, onCloneProfile, onDeleteProfile }: Props) => {
  const { currentProject } = useProject();

  const { data, isLoading } = useListCertificateProfiles({
    limit: 100,
    offset: 0,
    includeConfigs: true
  });

  const profiles = data?.certificateProfiles || [];

  if (!currentProject?.id) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Certificate Manager is not set up</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!profiles || profiles.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No existing certificate profiles</EmptyTitle>
          <EmptyDescription>
            Create your first profile to start issuing certificates on an Application.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Issuing CA</TableHead>
          <TableHead>Certificate Policy</TableHead>
          <TableHead className="w-5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {profiles.map((profile) => (
          <ProfileRow
            key={profile.id}
            profile={profile}
            onEditProfile={onEditProfile}
            onCloneProfile={onCloneProfile}
            onDeleteProfile={onDeleteProfile}
          />
        ))}
      </TableBody>
    </Table>
  );
};
