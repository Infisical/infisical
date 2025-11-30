/* eslint-disable no-nested-ternary */
import { useCallback } from "react";
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
import { useProjectPermission } from "@app/context";
import {
  ProjectPermissionActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { usePopUp, useToggle } from "@app/hooks";
import { useGetCaById } from "@app/hooks/api/ca/queries";
import { IssuerType, TCertificateProfile } from "@app/hooks/api/certificateProfiles";
import { useGetCertificateTemplateV2ById } from "@app/hooks/api/certificateTemplates/queries";
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
  const { permission } = useProjectPermission();

  const { data: caData } = useGetCaById(
    profile.certificateAuthority?.isExternal ? "" : (profile.caId ?? "")
  );

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

  const { data: templateData } = useGetCertificateTemplateV2ById({
    templateId: profile.certificateTemplateId
  });

  const canEditProfile = permission.can(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.CertificateAuthorities
  );

  const canRevealProfileAcmeEabSecret = permission.can(
    ProjectPermissionCertificateProfileActions.RevealAcmeEabSecret,
    ProjectPermissionSub.CertificateProfiles
  );

  const canIssueCertificate = permission.can(
    ProjectPermissionCertificateProfileActions.IssueCert,
    ProjectPermissionSub.CertificateProfiles
  );

  const canDeleteProfile = permission.can(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.CertificateAuthorities
  );

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
        <div className="flex items-center gap-2">
          <span className="text-sm text-mineshaft-300">
            {profile.issuerType === IssuerType.SELF_SIGNED
              ? "Self-signed"
              : profile.certificateAuthority?.isExternal
                ? profile.certificateAuthority.name
                : caData?.friendlyName ||
                  caData?.commonName ||
                  profile.certificateAuthority?.name ||
                  profile.caId}
          </span>
        </div>
      </Td>
      <Td>
        <span className="text-sm text-mineshaft-300">
          {templateData?.name || profile.certificateTemplateId}
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
            {canEditProfile && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEditProfile(profile);
                }}
                icon={<FontAwesomeIcon icon={faEdit} className="w-3" />}
              >
                Edit Profile
              </DropdownMenuItem>
            )}
            {canRevealProfileAcmeEabSecret && profile.enrollmentType === "acme" && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onRevealProfileAcmeEabSecret(profile);
                }}
                icon={<FontAwesomeIcon icon={faEye} className="w-3" />}
              >
                Reveal ACME EAB
              </DropdownMenuItem>
            )}
            {canIssueCertificate && profile.enrollmentType === "api" && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handlePopUpToggle("issueCertificate");
                }}
                icon={<FontAwesomeIcon icon={faPlus} className="w-3" />}
              >
                Request Certificate
              </DropdownMenuItem>
            )}
            {canDeleteProfile && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteProfile(profile);
                }}
                icon={<FontAwesomeIcon icon={faTrash} className="w-3" />}
              >
                Delete Profile
              </DropdownMenuItem>
            )}
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
