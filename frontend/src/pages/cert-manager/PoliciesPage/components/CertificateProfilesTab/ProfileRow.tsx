/* eslint-disable no-nested-ternary */
import { useCallback } from "react";
import { subject } from "@casl/ability";
import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  CopyIcon,
  CopyPlusIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  RowLink,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { getInstancePinningLink } from "@app/helpers/project";
import { useToggle } from "@app/hooks";
import { useGetInternalCaById } from "@app/hooks/api/ca/queries";
import { useGetCertificatePolicyById } from "@app/hooks/api/certificatePolicies";
import { IssuerType, TCertificateProfile } from "@app/hooks/api/certificateProfiles";

interface Props {
  profile: TCertificateProfile;
  onEditProfile: (profile: TCertificateProfile) => void;
  onCloneProfile: (profile: TCertificateProfile) => void;
  onDeleteProfile: (profile: TCertificateProfile) => void;
}

export const ProfileRow = ({ profile, onEditProfile, onCloneProfile, onDeleteProfile }: Props) => {
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
    <TableRow key={profile.id} linked>
      <TableCell>
        <div className="flex items-center gap-2">
          <RowLink
            {...getInstancePinningLink(
              currentProject.orgId,
              currentProject,
              `certificate-profiles/${profile.id}`
            )!}
            className="hover:underline"
          >
            {profile.slug}
          </RowLink>
          {profile.description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="size-3.5 text-muted" />
              </TooltipTrigger>
              <TooltipContent>{profile.description}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell className="text-start">
        <span className="text-sm">
          {profile.issuerType === IssuerType.SELF_SIGNED
            ? "Self-signed"
            : profile.certificateAuthority?.isExternal
              ? profile.certificateAuthority.name
              : caData?.configuration.friendlyName ||
                caData?.configuration.commonName ||
                profile.caId}
        </span>
      </TableCell>
      <TableCell data-row-interactive>
        <Link
          {...getInstancePinningLink(
            currentProject.orgId,
            currentProject,
            `certificate-policies/${profile.certificatePolicyId}`
          )!}
          className="text-sm hover:underline"
        >
          {policyData?.name || profile.certificatePolicyId}
        </Link>
      </TableCell>
      <TableCell className="text-right" data-row-interactive>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" size="xs" aria-label="Profile actions">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-40" align="end" sideOffset={2}>
            <DropdownMenuItem onClick={() => handleCopyId()}>
              {isIdCopied ? <CheckIcon /> : <CopyIcon />}
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
                  >
                    <PencilIcon />
                    Edit Profile
                  </DropdownMenuItem>
                )
              }
            </ProjectPermissionCan>
            <ProjectPermissionCan
              I={ProjectPermissionCertificateProfileActions.Create}
              a={ProjectPermissionSub.CertificateProfiles}
            >
              {(isAllowed) =>
                isAllowed && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloneProfile(profile);
                    }}
                  >
                    <CopyPlusIcon />
                    Clone Profile
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
                    variant="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteProfile(profile);
                    }}
                  >
                    <Trash2Icon />
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
