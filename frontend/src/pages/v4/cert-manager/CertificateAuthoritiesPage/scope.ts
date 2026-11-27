import { subject } from "@casl/ability";
import type { MongoAbility } from "@casl/ability";
import { useParams } from "@tanstack/react-router";

import {
  type ProjectPermissionCertificateAuthorityActions,
  type ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { useProjectPermission } from "../../access/permissions";
import { useCertManagerProjectId } from "../components/certificate";

const PKI_DOCS = "https://infisical.com/docs/documentation/platform/pki";

export const CA_DOCS = {
  internal: `${PKI_DOCS}/ca/private-ca`,
  external: `${PKI_DOCS}/ca/external-ca`,
  renewal: `${PKI_DOCS}/ca/ca-renewal`,
  crossSigned: `${PKI_DOCS}/ca/cross-signed-certificates`,
  crl: `${PKI_DOCS}/ca/crl-distribution`
};

export const RESTRICTED = "Your role doesn't allow this";

export const useCaScope = () => {
  const { orgId } = useParams({ strict: false }) as { orgId: string };
  const { projectId, isPending } = useCertManagerProjectId(orgId);
  const { permission, isPending: permissionPending } = useProjectPermission(projectId ?? "");
  return {
    orgId,
    projectId: projectId ?? "",
    hasProject: Boolean(projectId),
    isPending: isPending || (Boolean(projectId) && permissionPending),
    permission
  };
};

export const caBlock = (
  permission: MongoAbility<ProjectPermissionSet>,
  action: ProjectPermissionCertificateAuthorityActions,
  name?: string
) =>
  permission.can(
    action,
    name
      ? subject(ProjectPermissionSub.CertificateAuthorities, { name })
      : ProjectPermissionSub.CertificateAuthorities
  )
    ? undefined
    : RESTRICTED;
