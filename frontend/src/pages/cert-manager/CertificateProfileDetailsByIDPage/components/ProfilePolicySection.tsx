import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { TCertificateProfileWithDetails } from "@app/hooks/api/certificateProfiles";

type Props = {
  profile: TCertificateProfileWithDetails;
};

export const ProfilePolicySection = ({ profile }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  return (
    <Card className="mt-4 w-full">
      <CardHeader className="border-b">
        <CardTitle>Certificate Policy</CardTitle>
        <CardDescription>Rules applied to certificates issued by this profile</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          <Detail className="min-w-0">
            <DetailLabel>Policy</DetailLabel>
            <DetailValue className="flex min-w-0 max-w-full">
              <Badge variant="neutral" isTruncatable className="max-w-full" asChild>
                <Link
                  to="/organizations/$orgId/projects/cert-manager/$projectId/certificate-policies/$policyId"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id,
                    policyId: profile.certificatePolicyId
                  }}
                  search={{ from: "profile", profileId: profile.id }}
                >
                  <span className="min-w-0">
                    {profile.certificatePolicy?.name || profile.certificatePolicyId}
                  </span>
                  <ExternalLinkIcon />
                </Link>
              </Badge>
            </DetailValue>
          </Detail>

          {profile.certificatePolicy?.description && (
            <Detail>
              <DetailLabel>Description</DetailLabel>
              <DetailValue>{profile.certificatePolicy.description}</DetailValue>
            </Detail>
          )}
        </DetailGroup>
      </CardContent>
    </Card>
  );
};
