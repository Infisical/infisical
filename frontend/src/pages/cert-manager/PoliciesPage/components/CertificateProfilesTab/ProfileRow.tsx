/* eslint-disable no-nested-ternary */
import { faCircleInfo, faEdit, faEllipsis, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { useProjectPermission } from "@app/context";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useGetCaById } from "@app/hooks/api/ca/queries";
import { TCertificateProfile } from "@app/hooks/api/certificateProfiles";
import { useGetCertificateTemplateV2ById } from "@app/hooks/api/certificateTemplates/queries";

interface Props {
  profile: TCertificateProfile;
  onEditProfile: (profile: TCertificateProfile) => void;
  onDeleteProfile: (profile: TCertificateProfile) => void;
}

export const ProfileRow = ({ profile, onEditProfile, onDeleteProfile }: Props) => {
  const { permission } = useProjectPermission();

  const { data: caData } = useGetCaById(profile.caId);

  const { data: templateData } = useGetCertificateTemplateV2ById({
    templateId: profile.certificateTemplateId
  });

  const canEditProfile = permission.can(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.CertificateAuthorities
  );

  const canDeleteProfile = permission.can(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.CertificateAuthorities
  );

  const getEnrollmentTypeBadge = (enrollmentType: string) => {
    const config = {
      api: { variant: "success" as const, label: "API" },
      est: { variant: "primary" as const, label: "EST" }
    };

    const { variant, label } = config[enrollmentType as keyof typeof config] || config.api;

    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <Tr key={profile.id} className="h-10 transition-colors duration-100 hover:bg-mineshaft-700">
      <Td>
        <div className="flex items-center gap-2">
          <div className="font-medium text-mineshaft-100">{profile.slug}</div>
          {profile.description && (
            <Tooltip content={profile.description}>
              <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
            </Tooltip>
          )}
        </div>
      </Td>
      <Td className="text-center">{getEnrollmentTypeBadge(profile.enrollmentType)}</Td>
      <Td className="text-center">
        <span className="text-sm text-mineshaft-300">
          {caData?.friendlyName || caData?.commonName || profile.caId}
        </span>
      </Td>
      <Td>
        <span className="text-sm text-mineshaft-300">
          {templateData?.slug || profile.certificateTemplateId}
        </span>
      </Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          {profile.metrics ? (
            profile.metrics.totalCertificates === 0 ? (
              <Badge variant="primary" className="text-xs">
                No certificates
              </Badge>
            ) : (
              <>
                {profile.metrics.activeCertificates > 0 && (
                  <Badge variant="success" className="text-xs">
                    {profile.metrics.activeCertificates} active
                  </Badge>
                )}
                {profile.metrics.expiringCertificates > 0 && (
                  <Badge variant="primary" className="text-xs">
                    {profile.metrics.expiringCertificates} expiring
                  </Badge>
                )}
                {profile.metrics.expiredCertificates > 0 && (
                  <Badge variant="danger" className="text-xs">
                    {profile.metrics.expiredCertificates} expired
                  </Badge>
                )}
                {profile.metrics.revokedCertificates > 0 && (
                  <Badge variant="danger" className="text-xs">
                    {profile.metrics.revokedCertificates} revoked
                  </Badge>
                )}
              </>
            )
          ) : (
            <Badge variant="primary" className="text-xs">
              No metrics
            </Badge>
          )}
        </div>
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
            {canEditProfile && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEditProfile(profile);
                }}
                icon={<FontAwesomeIcon icon={faEdit} />}
              >
                Edit Profile
              </DropdownMenuItem>
            )}
            {canDeleteProfile && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteProfile(profile);
                }}
                icon={<FontAwesomeIcon icon={faTrash} />}
              >
                Delete Profile
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </Td>
    </Tr>
  );
};
