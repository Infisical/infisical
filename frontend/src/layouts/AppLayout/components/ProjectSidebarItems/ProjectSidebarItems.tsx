import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useRouter } from "next/router";

import { Menu, MenuItem } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetAccessRequestsCount, useGetSecretApprovalRequestCount } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/workspace/types";

export const ProjectSidebarItem = () => {
  const { currentWorkspace } = useWorkspace();
  const router = useRouter();
  const { t } = useTranslation();

  const workspaceId = currentWorkspace?.id || "";
  const projectSlug = currentWorkspace?.slug || "";

  const { data: secretApprovalReqCount } = useGetSecretApprovalRequestCount({ workspaceId });
  const { data: accessApprovalRequestCount } = useGetAccessRequestsCount({ projectSlug });

  const pendingRequestsCount =
    (secretApprovalReqCount?.open || 0) + (accessApprovalRequestCount?.pendingCount || 0);

  if (
    !currentWorkspace ||
    router.asPath.startsWith("personal") ||
    router.asPath.startsWith("integrations") ||
    router.asPath.startsWith("/app-connections")
  ) {
    return <div />;
  }

  const isSecretManager = currentWorkspace?.type === ProjectType.SecretManager;
  const isCertManager = currentWorkspace?.type === ProjectType.CertificateManager;
  const isCmek = currentWorkspace?.type === ProjectType.KMS;
  const isSsh = currentWorkspace?.type === ProjectType.SSH;

  return (
    <Menu>
      {isSecretManager && (
        <Link
          href={`/${ProjectType.SecretManager}/${currentWorkspace?.id}/secrets/overview`}
          passHref
        >
          <a>
            <MenuItem
              isSelected={router.asPath.includes(
                `/${ProjectType.SecretManager}/${currentWorkspace?.id}/secrets`
              )}
              icon="system-outline-90-lock-closed"
            >
              {t("nav.menu.secrets")}
            </MenuItem>
          </a>
        </Link>
      )}
      {isCertManager && (
        <Link
          href={`/${ProjectType.CertificateManager}/${currentWorkspace?.id}/certificates`}
          passHref
        >
          <a>
            <MenuItem
              isSelected={
                router.asPath ===
                `/${ProjectType.CertificateManager}/${currentWorkspace?.id}/certificates`
              }
              icon="system-outline-90-lock-closed"
            >
              Overview
            </MenuItem>
          </a>
        </Link>
      )}
      {isCmek && (
        <Link href={`/${ProjectType.KMS}/${currentWorkspace?.id}/kms`} passHref>
          <a>
            <MenuItem
              isSelected={router.asPath === `/${ProjectType.KMS}/${currentWorkspace?.id}/kms`}
              icon="system-outline-90-lock-closed"
            >
              Overview
            </MenuItem>
          </a>
        </Link>
      )}
      {isSsh && (
        <Link href={`/${ProjectType.SSH}/${currentWorkspace?.id}/certificates`} passHref>
          <a>
            <MenuItem
              isSelected={router.asPath === `/${ProjectType.SSH}/${currentWorkspace?.id}/certificates`}
              icon="system-outline-90-lock-closed"
            >
              Certificates
            </MenuItem>
          </a>
        </Link>
      )}
      {isSsh && (
        <Link href={`/${ProjectType.SSH}/${currentWorkspace?.id}/cas`} passHref>
          <a>
            <MenuItem
              isSelected={router.asPath === `/${ProjectType.SSH}/${currentWorkspace?.id}/cas`}
              icon="system-outline-90-lock-closed"
            >
              Certificate Authorities
            </MenuItem>
          </a>
        </Link>
      )}
      <Link href={`/${currentWorkspace.type}/${currentWorkspace?.id}/members`} passHref>
        <a>
          <MenuItem
            isSelected={router.asPath.endsWith(`/${currentWorkspace?.id}/members`)}
            icon="system-outline-96-groups"
          >
            Access Control
          </MenuItem>
        </a>
      </Link>
      {isSecretManager && (
        <Link href={`/integrations/${currentWorkspace?.id}`} passHref>
          <a>
            <MenuItem
              isSelected={router.asPath.includes("/integrations")}
              icon="system-outline-82-extension"
            >
              {t("nav.menu.integrations")}
            </MenuItem>
          </a>
        </Link>
      )}
      {isSecretManager && (
        <Link
          href={`/${ProjectType.SecretManager}/${currentWorkspace?.id}/secret-rotation`}
          passHref
        >
          <a className="relative">
            <MenuItem
              isSelected={
                router.asPath ===
                `/${ProjectType.SecretManager}/${currentWorkspace?.id}/secret-rotation`
              }
              icon="rotation"
            >
              Secret Rotation
            </MenuItem>
          </a>
        </Link>
      )}
      {isSecretManager && (
        <Link href={`/secret-manager/${currentWorkspace?.id}/approval`} passHref>
          <a className="relative">
            <MenuItem
              isSelected={
                router.asPath === `/${ProjectType.SecretManager}/${currentWorkspace?.id}/approval`
              }
              icon="system-outline-189-domain-verification"
            >
              Approvals
              {Boolean(
                secretApprovalReqCount?.open || accessApprovalRequestCount?.pendingCount
              ) && (
                <span className="ml-2 rounded border border-primary-400 bg-primary-600 py-0.5 px-1 text-xs font-semibold text-black">
                  {pendingRequestsCount}
                </span>
              )}
            </MenuItem>
          </a>
        </Link>
      )}
      <Link href={`/${currentWorkspace.type}/${currentWorkspace?.id}/settings`} passHref>
        <a>
          <MenuItem
            isSelected={router.asPath.endsWith(`/${currentWorkspace?.id}/settings`)}
            icon="system-outline-109-slider-toggle-settings"
          >
            {t("nav.menu.project-settings")}
          </MenuItem>
        </a>
      </Link>
    </Menu>
  );
};
