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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Tr key={profile.id} className="h-10 transition-colors duration-100 hover:bg-mineshaft-700">
      <Td>
        <div>
          <div className="flex items-center gap-2">
            <div className="font-medium text-mineshaft-100">{profile.name}</div>
            {profile.description && (
              <Tooltip content={profile.description}>
                <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
              </Tooltip>
            )}
          </div>
          <div className="text-xs text-bunker-300">{profile.slug}</div>
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
          {templateData?.name || profile.certificateTemplateId}
        </span>
      </Td>
      <Td>
        <div className="flex gap-2 text-xs">
          {profile.metrics ? (
            profile.metrics.totalCertificates === 0 ? (
              <span className="text-bunker-300">No certificates attached</span>
            ) : (
              <>
                {profile.metrics.activeCertificates > 0 && (
                  <span className="text-green-400">
                    {profile.metrics.activeCertificates} active
                  </span>
                )}
                {profile.metrics.expiringCertificates > 0 && (
                  <>
                    {profile.metrics.activeCertificates > 0 && (
                      <span className="text-gray-400">•</span>
                    )}
                    <span className="text-yellow-400">
                      {profile.metrics.expiringCertificates} expiring
                    </span>
                  </>
                )}
                {profile.metrics.expiredCertificates > 0 && (
                  <>
                    {(profile.metrics.activeCertificates > 0 ||
                      profile.metrics.expiringCertificates > 0) && (
                      <span className="text-gray-400">•</span>
                    )}
                    <span className="text-red-300">
                      {profile.metrics.expiredCertificates} expired
                    </span>
                  </>
                )}
                {profile.metrics.revokedCertificates > 0 && (
                  <>
                    {(profile.metrics.activeCertificates > 0 ||
                      profile.metrics.expiringCertificates > 0 ||
                      profile.metrics.expiredCertificates > 0) && (
                      <span className="text-gray-400">•</span>
                    )}
                    <span className="text-red-400">
                      {profile.metrics.revokedCertificates} revoked
                    </span>
                  </>
                )}
              </>
            )
          ) : (
            <span className="text-bunker-300">No metrics available</span>
          )}
        </div>
      </Td>
      <Td>
        <span className="text-sm text-bunker-300">{formatDate(profile.createdAt)}</span>
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
