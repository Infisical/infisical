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
import { useGetInternalCaById } from "@app/hooks/api/ca/queries";
import { IssuerType, TCertificateProfileWithDetails } from "@app/hooks/api/certificateProfiles";

type Props = {
  profile: TCertificateProfileWithDetails;
};

export const ProfileIssuerSection = ({ profile }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const isSelfSigned = profile.issuerType === IssuerType.SELF_SIGNED;
  const isInternalCa = !isSelfSigned && !profile.certificateAuthority?.isExternal;

  const { data: internalCa } = useGetInternalCaById(
    isInternalCa && profile.caId ? profile.caId : ""
  );

  return (
    <Card className="mt-4 w-full">
      <CardHeader className="border-b">
        <CardTitle>Issuer</CardTitle>
        <CardDescription>Where certificates issued through this profile are signed</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          {isSelfSigned ? (
            <Detail>
              <DetailLabel>Issuer</DetailLabel>
              <DetailValue>
                <Badge variant="warning">Self-Signed</Badge>
              </DetailValue>
            </Detail>
          ) : (
            <>
              <Detail>
                <DetailLabel>Source</DetailLabel>
                <DetailValue>
                  <Badge variant="neutral">
                    {profile.certificateAuthority?.isExternal
                      ? "External CA"
                      : "Internal CA"}
                  </Badge>
                </DetailValue>
              </Detail>

              <Detail className="min-w-0">
                <DetailLabel>Certificate Authority</DetailLabel>
                <DetailValue className="flex min-w-0 max-w-full">
                  {isInternalCa && profile.caId ? (
                    <Badge variant="neutral" isTruncatable className="max-w-full" asChild>
                      <Link
                        to="/organizations/$orgId/projects/cert-manager/$projectId/ca/$caId"
                        params={{
                          orgId: currentOrg.id,
                          projectId: currentProject.id,
                          caId: profile.caId
                        }}
                        search={{ from: "profile", profileId: profile.id }}
                      >
                        <span className="min-w-0">
                          {internalCa?.configuration?.friendlyName ||
                            internalCa?.configuration?.commonName ||
                            profile.caId}
                        </span>
                        <ExternalLinkIcon />
                      </Link>
                    </Badge>
                  ) : (
                    <span className="min-w-0 break-all">
                      {profile.certificateAuthority?.name || "N/A"}
                    </span>
                  )}
                </DetailValue>
              </Detail>

              {profile.certificateAuthority?.isExternal &&
                profile.certificateAuthority.externalType && (
                  <Detail>
                    <DetailLabel>External Type</DetailLabel>
                    <DetailValue>
                      <Badge variant="info">{profile.certificateAuthority.externalType}</Badge>
                    </DetailValue>
                  </Detail>
                )}
            </>
          )}
        </DetailGroup>
      </CardContent>
    </Card>
  );
};
