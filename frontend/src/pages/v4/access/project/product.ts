import { supportsAssumePrivileges } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";
import type { TWorkspaceUser } from "@app/hooks/api/users/types";

import { productOf } from "../../shell/navigation";
import { ORG_SCOPED_ACCESS_PRODUCTS } from "./scope";

const ROLE_DETAILS_HIDDEN_FOR_IDENTITIES = new Set<ProjectType>([
  ProjectType.CertificateManager,
  ProjectType.PAM,
  ProjectType.SecretScanning
]);

export const canAssumeUserIn = (projectType: ProjectType) =>
  projectType !== ProjectType.CertificateManager && supportsAssumePrivileges(projectType);

export const memberDetailId = (projectType: ProjectType, member: TWorkspaceUser) =>
  projectType === ProjectType.CertificateManager ? member.user.id : member.id;

export const linksMemberRoles = (projectType: ProjectType) =>
  projectType !== ProjectType.CertificateManager;

export const linksIdentityRoles = (projectType: ProjectType) =>
  !ROLE_DETAILS_HIDDEN_FOR_IDENTITIES.has(projectType);

export const accessNoun = (projectType: ProjectType) =>
  ORG_SCOPED_ACCESS_PRODUCTS.has(projectType) ? productOf(projectType).label : "project";

export const accessLabel = (projectType: ProjectType, label: string) =>
  ORG_SCOPED_ACCESS_PRODUCTS.has(projectType)
    ? `${label.charAt(0).toUpperCase()}${label.slice(1)}`
    : `Project ${label}`;

export const accessThis = (projectType: ProjectType) =>
  ORG_SCOPED_ACCESS_PRODUCTS.has(projectType) ? productOf(projectType).label : "this project";

export const accessThe = (projectType: ProjectType) =>
  ORG_SCOPED_ACCESS_PRODUCTS.has(projectType) ? productOf(projectType).label : "the project";
