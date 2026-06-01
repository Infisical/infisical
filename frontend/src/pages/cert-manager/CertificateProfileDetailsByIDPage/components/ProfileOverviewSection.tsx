import { subject } from "@casl/ability";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  CheckIcon,
  ClipboardListIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  PencilIcon,
  Trash2Icon
} from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useTimedReset } from "@app/hooks";
import { EXTERNAL_CA_TYPE_NAME_MAP } from "@app/hooks/api/ca/constants";
import { useGetInternalCaById } from "@app/hooks/api/ca/queries";
import { IssuerType, TCertificateProfileWithDetails } from "@app/hooks/api/certificateProfiles";

type Props = {
  profile: TCertificateProfileWithDetails;
  onEdit: () => void;
  onDelete: () => void;
  backContext: {
    from?: "settings" | "application";
    applicationName?: string;
  };
};

export const ProfileOverviewSection = ({ profile, onEdit, onDelete, backContext }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const isSelfSigned = profile.issuerType === IssuerType.SELF_SIGNED;
  const isInternalCa = !isSelfSigned && !profile.certificateAuthority?.isExternal;

  const { data: internalCa } = useGetInternalCaById(
    isInternalCa && profile.caId ? profile.caId : ""
  );

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Details</CardTitle>
        <CardDescription>Certificate profile details</CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="ghost" size="xs" aria-label="Profile options">
                <EllipsisIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-40" align="end" sideOffset={2}>
              <ProjectPermissionCan
                I={ProjectPermissionCertificateProfileActions.Edit}
                a={subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })}
              >
                {(canEdit) => (
                  <DropdownMenuItem isDisabled={!canEdit} onClick={onEdit}>
                    <PencilIcon />
                    Edit Profile
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionCertificateProfileActions.Delete}
                a={subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })}
              >
                {(canDelete) => (
                  <DropdownMenuItem variant="danger" isDisabled={!canDelete} onClick={onDelete}>
                    <Trash2Icon />
                    Delete Profile
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{profile.slug}</DetailValue>
          </Detail>

          <Detail>
            <DetailLabel>Profile ID</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              <span className="break-all">{profile.id}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    aria-label="Copy profile ID"
                    onClick={() => {
                      navigator.clipboard.writeText(profile.id);
                      setCopyTextId("Copied");
                    }}
                  >
                    {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>{isCopyingId ? "Copied" : "Copy ID to clipboard"}</TooltipContent>
              </Tooltip>
            </DetailValue>
          </Detail>

          {profile.description && (
            <Detail>
              <DetailLabel>Description</DetailLabel>
              <DetailValue>{profile.description}</DetailValue>
            </Detail>
          )}

          {profile.createdAt && (
            <Detail>
              <DetailLabel>Created</DetailLabel>
              <DetailValue>
                {format(new Date(profile.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </DetailValue>
            </Detail>
          )}

          {profile.updatedAt && (
            <Detail>
              <DetailLabel>Last Updated</DetailLabel>
              <DetailValue>
                {format(new Date(profile.updatedAt), "MMM d, yyyy 'at' h:mm a")}
              </DetailValue>
            </Detail>
          )}
        </DetailGroup>

        <div className="mt-6 border-t border-border pt-6">
          <h3 className="mb-4 text-base font-semibold text-foreground">Issuer</h3>
          <DetailGroup>
            {isSelfSigned ? (
              <Detail>
                <DetailLabel>Source</DetailLabel>
                <DetailValue>
                  <Badge variant="neutral">Self-Signed</Badge>
                </DetailValue>
              </Detail>
            ) : (
              <>
                <Detail>
                  <DetailLabel>Source</DetailLabel>
                  <DetailValue>
                    <Badge variant="neutral">
                      {profile.certificateAuthority?.isExternal ? "External CA" : "Internal CA"}
                    </Badge>
                  </DetailValue>
                </Detail>

                {profile.certificateAuthority?.isExternal &&
                  profile.certificateAuthority.externalType && (
                    <Detail>
                      <DetailLabel>External Type</DetailLabel>
                      <DetailValue>
                        <Badge variant="info">
                          {EXTERNAL_CA_TYPE_NAME_MAP[profile.certificateAuthority.externalType] ||
                            profile.certificateAuthority.externalType}
                        </Badge>
                      </DetailValue>
                    </Detail>
                  )}

                <Detail className="min-w-0">
                  <DetailLabel>Certificate Authority</DetailLabel>
                  <DetailValue className="min-w-0">
                    {isInternalCa && profile.caId ? (
                      <Link
                        to="/organizations/$orgId/projects/cert-manager/$projectId/ca/$caId"
                        params={{
                          orgId: currentOrg.id,
                          projectId: currentProject.id,
                          caId: profile.caId
                        }}
                        search={{
                          from: "profile",
                          profileId: profile.id,
                          profileFrom: backContext.from,
                          profileApplicationName: backContext.applicationName
                        }}
                        className="flex max-w-full items-center gap-x-1 hover:underline"
                      >
                        <span className="min-w-0 truncate">
                          {internalCa?.name ||
                            internalCa?.configuration?.friendlyName ||
                            internalCa?.configuration?.commonName ||
                            profile.caId}
                        </span>
                        <ExternalLinkIcon className="size-3.5 shrink-0" />
                      </Link>
                    ) : (
                      <span className="break-all">
                        {profile.certificateAuthority?.name || "N/A"}
                      </span>
                    )}
                  </DetailValue>
                </Detail>
              </>
            )}
          </DetailGroup>
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <h3 className="mb-4 text-base font-semibold text-foreground">Certificate Policy</h3>
          <DetailGroup>
            <Detail className="min-w-0">
              <DetailLabel>Policy</DetailLabel>
              <DetailValue className="min-w-0">
                <Link
                  to="/organizations/$orgId/projects/cert-manager/$projectId/certificate-policies/$policyId"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id,
                    policyId: profile.certificatePolicyId
                  }}
                  search={{
                    from: "profile",
                    profileId: profile.id,
                    profileFrom: backContext.from,
                    profileApplicationName: backContext.applicationName
                  }}
                  className="flex max-w-full items-center gap-x-1 hover:underline"
                >
                  <span className="min-w-0 truncate">
                    {profile.certificatePolicy?.name || profile.certificatePolicyId}
                  </span>
                  <ExternalLinkIcon className="size-3.5 shrink-0" />
                </Link>
              </DetailValue>
            </Detail>

            {profile.certificatePolicy?.description && (
              <Detail>
                <DetailLabel>Description</DetailLabel>
                <DetailValue>{profile.certificatePolicy.description}</DetailValue>
              </Detail>
            )}
          </DetailGroup>
        </div>
      </CardContent>
    </Card>
  );
};
