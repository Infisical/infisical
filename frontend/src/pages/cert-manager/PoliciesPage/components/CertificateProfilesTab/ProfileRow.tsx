/* eslint-disable no-nested-ternary */
import { useCallback } from "react";
import { subject } from "@casl/ability";
import {
  faCheck,
  faCircleInfo,
  faCopy,
  faEdit,
  faEllipsis,
  faEye,
  faPlus,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { usePopUp, useToggle } from "@app/hooks";
import { useGetInternalCaById } from "@app/hooks/api/ca/queries";
import { IssuerType, TCertificateProfile } from "@app/hooks/api/certificateProfiles";
import { useGetCertificatePolicyById } from "@app/hooks/api/certificatePolicies";
import { CertificateIssuanceModal } from "@app/pages/cert-manager/CertificatesPage/components/CertificateIssuanceModal";

interface Props {
  profile: TCertificateProfile;
  onEditProfile: (profile: TCertificateProfile) => void;
  onRevealProfileAcmeEabSecret: (profile: TCertificateProfile) => void;
  onDeleteProfile: (profile: TCertificateProfile) => void;
}

export const ProfileRow = ({
  profile,
  onEditProfile,
  onRevealProfileAcmeEabSecret,
  onDeleteProfile
}: Props) => {
  const { data: caData } = useGetInternalCaById(profile.caId ?? "");

  const { popUp, handlePopUpToggle } = usePopUp(["issueCertificate"] as const);

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

  const getEnrollmentTypeBadge = (enrollmentType: string) => {
    const config = {
      api: { variant: "ghost" as const, label: "API" },
      est: { variant: "ghost" as const, label: "EST" },
      acme: { variant: "ghost" as const, label: "ACME" }
    } as const;

    const configKey = Object.keys(config).includes(enrollmentType)
      ? (enrollmentType as keyof typeof config)
      : "api";
    const { variant, label } = config[configKey];

    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <Tr key={profile.id} className="h-10 transition-colors duration-100 hover:bg-mineshaft-700">
      <Td>
        <div className="flex items-center gap-2">
          <div className="text-mineshaft-300">{profile.slug}</div>
          {profile.description && (
            <Tooltip content={profile.description}>
              <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
            </Tooltip>
          )}
        </div>
      </Td>
      <Td className="text-start">{getEnrollmentTypeBadge(profile.enrollmentType)}</Td>
      <Td className="text-start">
        <span className="text-sm text-mineshaft-300">
          {profile.issuerType === IssuerType.SELF_SIGNED
            ? "Self-signed"
            : profile.certificateAuthority?.isExternal
              ? profile.certificateAuthority.name
              : caData?.configuration.friendlyName ||
                caData?.configuration.commonName ||
                profile.caId}
        </span>
      </Td>
      <Td>
        <span className="text-sm text-mineshaft-300">
          {policyData?.name || profile.certificatePolicyId}
        </span>
      </Td>
      <Td className="text-right">
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
            {profile.enrollmentType === "acme" && (
              <ProjectPermissionCan
                I={ProjectPermissionCertificateProfileActions.RevealAcmeEabSecret}
                a={subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })}
              >
                {(isAllowed) =>
                  isAllowed && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onRevealProfileAcmeEabSecret(profile);
                      }}
                      icon={<FontAwesomeIcon icon={faEye} className="w-3" />}
                    >
                      Reveal ACME EAB
                    </DropdownMenuItem>
                  )
                }
              </ProjectPermissionCan>
            )}
            {profile.enrollmentType === "api" && (
              <ProjectPermissionCan
                I={ProjectPermissionCertificateProfileActions.IssueCert}
                a={subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })}
              >
                {(isAllowed) =>
                  isAllowed && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePopUpToggle("issueCertificate");
                      }}
                      icon={<FontAwesomeIcon icon={faPlus} className="w-3" />}
                    >
                      Request Certificate
                    </DropdownMenuItem>
                  )
                }
              </ProjectPermissionCan>
            )}
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
        <CertificateIssuanceModal
          popUp={popUp}
          handlePopUpToggle={handlePopUpToggle}
          profileId={profile.id}
        />
      </Td>
    </Tr>
  );
};
