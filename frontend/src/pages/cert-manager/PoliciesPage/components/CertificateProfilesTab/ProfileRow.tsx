/* eslint-disable no-nested-ternary */
import { useCallback } from "react";
import { subject } from "@casl/ability";
import {
  faCheck,
  faCircleInfo,
  faCopy,
  faEdit,
  faEllipsis,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip
} from "@app/components/v2";
import { TableCell, TableRow } from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useToggle } from "@app/hooks";
import { useGetInternalCaById } from "@app/hooks/api/ca/queries";
import { useGetCertificatePolicyById } from "@app/hooks/api/certificatePolicies";
import { IssuerType, TCertificateProfile } from "@app/hooks/api/certificateProfiles";

interface Props {
  profile: TCertificateProfile;
  onEditProfile: (profile: TCertificateProfile) => void;
  onDeleteProfile: (profile: TCertificateProfile) => void;
}

export const ProfileRow = ({ profile, onEditProfile, onDeleteProfile }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const isInternalCa = !profile.certificateAuthority?.isExternal;
  const { data: caData } = useGetInternalCaById(isInternalCa ? (profile.caId ?? "") : "");

  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = useCallback(() => {
    setIsIdCopied.on();
    navigator.clipboard.writeText(profile.id);

    createNotification({
      text: "Profile ID copied to clipboard",
      type: "info"
    });

    setTimeout(() => setIsIdCopied.off(), 2000);
  }, [setIsIdCopied]);

  const { data: policyData } = useGetCertificatePolicyById({
    policyId: profile.certificatePolicyId
  });

  return (
    <TableRow key={profile.id}>
      <TableCell>
        <div className="flex items-center gap-2">
          <Link
            to="/organizations/$orgId/projects/cert-manager/$projectId/certificate-profiles/$profileId"
            params={{
              orgId: currentOrg.id,
              projectId: currentProject.id,
              profileId: profile.id
            }}
            className="text-mineshaft-300 hover:text-primary-400"
          >
            {profile.slug}
          </Link>
          {profile.description && (
            <Tooltip content={profile.description}>
              <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell className="text-start">
        <span className="text-sm text-mineshaft-300">
          {profile.issuerType === IssuerType.SELF_SIGNED
            ? "Self-signed"
            : profile.certificateAuthority?.isExternal
              ? profile.certificateAuthority.name
              : caData?.configuration.friendlyName ||
                caData?.configuration.commonName ||
                profile.caId}
        </span>
      </TableCell>
      <TableCell>
        <Link
          to="/organizations/$orgId/projects/cert-manager/$projectId/certificate-policies/$policyId"
          params={{
            orgId: currentOrg.id,
            projectId: currentProject.id,
            policyId: profile.certificatePolicyId
          }}
          className="text-sm text-mineshaft-300 hover:text-primary-400"
        >
          {policyData?.name || profile.certificatePolicyId}
        </Link>
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="rounded-lg">
            <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
              <Tooltip content="More options">
                <FontAwesomeIcon size="lg" icon={faEllipsis} />
              </Tooltip>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-1">
            <DropdownMenuItem
              icon={<FontAwesomeIcon icon={isIdCopied ? faCheck : faCopy} className="w-3" />}
              onClick={() => handleCopyId()}
            >
              Copy Profile ID
            </DropdownMenuItem>
            <ProjectPermissionCan
              I={ProjectPermissionCertificateProfileActions.Edit}
              a={subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })}
            >
              {(isAllowed) =>
                isAllowed && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditProfile(profile);
                    }}
                    icon={<FontAwesomeIcon icon={faEdit} className="w-3" />}
                  >
                    Edit Profile
                  </DropdownMenuItem>
                )
              }
            </ProjectPermissionCan>
            <ProjectPermissionCan
              I={ProjectPermissionCertificateProfileActions.Delete}
              a={subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })}
            >
              {(isAllowed) =>
                isAllowed && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteProfile(profile);
                    }}
                    icon={<FontAwesomeIcon icon={faTrash} className="w-3" />}
                  >
                    Delete Profile
                  </DropdownMenuItem>
                )
              }
            </ProjectPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
