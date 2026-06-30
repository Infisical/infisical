import {
  FileKeyIcon,
  KeyIcon,
  LockIcon,
  LucideIcon,
  RadarIcon,
  TerminalIcon,
  UsersIcon
} from "lucide-react";

import { apiRequest } from "@app/config/request";
import { createWorkspace } from "@app/hooks/api/projects/queries";
import { Project, ProjectEnv, ProjectType } from "@app/hooks/api/projects/types";

const secretsToBeAdded = [
  {
    secretKey: "DATABASE_URL",
    // eslint-disable-next-line no-template-curly-in-string
    secretValue: "mongodb+srv://${DB_USERNAME}:${DB_PASSWORD}@mongodb.net",
    secretComment: "Secret referencing example"
  },
  {
    secretKey: "DB_USERNAME",
    secretValue: "OVERRIDE_THIS",
    secretComment: "Override secrets with personal value"
  },
  {
    secretKey: "DB_PASSWORD",
    secretValue: "example_password"
  },
  {
    secretKey: "TWILIO_AUTH_TOKEN",
    secretValue: "example_twillio_token"
  },
  {
    secretKey: "WEBSITE_URL",
    secretValue: "http://localhost:3000"
  }
];

/**
 * Create and initialize a new project in organization with id [organizationId]
 * Note: current user should be a member of the organization
 */
export const initProjectHelper = async ({ projectName }: { projectName: string }) => {
  // create new project
  const {
    data: { project }
  } = await createWorkspace({
    projectName,
    type: ProjectType.SecretManager
  });

  try {
    const { data } = await apiRequest.post("/api/v4/secrets/batch", {
      projectId: project.id,
      environment: "dev",
      secretPath: "/",
      secrets: secretsToBeAdded
    });
    return data;
  } catch (err) {
    console.error("Failed to upload secrets", err);
  }

  return project;
};

export const projectTypeToUrlSlug = (type: ProjectType): string => {
  if (type === ProjectType.SecretManager) return "secret-management";
  return type;
};

const VALID_PROJECT_SLUGS = new Set<string>([
  "secret-management",
  ProjectType.CertificateManager,
  ProjectType.KMS,
  ProjectType.SecretScanning,
  ProjectType.PAM
]);

export const urlSlugToProjectType = (slug: string): ProjectType | null => {
  if (!VALID_PROJECT_SLUGS.has(slug)) return null;
  if (slug === "secret-management") return ProjectType.SecretManager;
  return slug as ProjectType;
};

// Org-wide resource pages (KMIP servers, Secret Sharing) live at literal
// /projects/<slug>/<resource> paths with no $type route param. Parse the product slug out of the
// pathname so the sidebar can resolve the active product when the route param is absent.
const ORG_RESOURCE_PROJECT_SLUG_RE =
  /\/projects\/([^/]+)\/(?:kmip-servers|secret-sharing|product-settings)/;

export const parseProjectSlugFromPath = (pathname: string): string | undefined =>
  pathname.match(ORG_RESOURCE_PROJECT_SLUG_RE)?.[1];

const PROJECT_TYPES_WITH_INTERMEDIATE_VIEW = new Set<ProjectType>([
  ProjectType.SecretManager,
  ProjectType.KMS,
  ProjectType.SecretScanning,
  ProjectType.PAM
]);

export const hasIntermediateProjectsView = (type: ProjectType) =>
  PROJECT_TYPES_WITH_INTERMEDIATE_VIEW.has(type);

export const getProjectBaseURL = (type: ProjectType) => {
  switch (type) {
    case ProjectType.SecretManager:
      return "/organizations/$orgId/projects/secret-management/$projectId";
    case ProjectType.CertificateManager:
      return "/organizations/$orgId/projects/cert-manager/$projectId";
    default:
      return `/organizations/$orgId/projects/${type}/$projectId` as const;
  }
};

// @ts-expect-error akhilmhdh: will remove this later
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getProjectHomePage = (type: ProjectType, environments: ProjectEnv[]) => {
  switch (type) {
    case ProjectType.SecretManager:
      return "/organizations/$orgId/projects/secret-management/$projectId/overview" as const;
    case ProjectType.CertificateManager:
      return "/organizations/$orgId/projects/cert-manager/$projectId/overview" as const;
    case ProjectType.SecretScanning:
      return `/organizations/$orgId/projects/${type}/$projectId/data-sources` as const;
    case ProjectType.PAM:
      return `/organizations/$orgId/projects/${type}/$projectId/resources` as const;
    default:
      return `/organizations/$orgId/projects/${type}/$projectId/overview` as const;
  }
};

export const getProjectTitle = (type: ProjectType) => {
  const titleConvert: Partial<Record<ProjectType, string>> = {
    [ProjectType.SecretManager]: "Secrets Management",
    [ProjectType.KMS]: "KMS",
    [ProjectType.CertificateManager]: "Certificate Manager",
    [ProjectType.SSH]: "SSH",
    [ProjectType.SecretScanning]: "Secret Scanning",
    [ProjectType.PAM]: "PAM"
  };
  return titleConvert[type] || type;
};

export const getProjectDescription = (type: ProjectType) => {
  const descriptions: Partial<Record<ProjectType, string>> = {
    [ProjectType.SecretManager]:
      "Centralize secrets across environments with automatic secret syncs, secret rotations, short-lived dynamic credentials, and lifecycle policies.",
    [ProjectType.CertificateManager]:
      "Issue, rotate, and govern X.509 certificates for TLS, mTLS, code signing, and device identity.",
    [ProjectType.KMS]:
      "Generate, store, and use cryptographic keys to encrypt, decrypt, sign, and verify against managed CMKs.",
    [ProjectType.SecretScanning]:
      "Continuously scan repositories, builds, and runtime artifacts for leaked secrets and misconfigurations.",
    [ProjectType.PAM]:
      "Grant privileged users and machines just-in-time access with session brokering and credential vaulting."
  };
  return descriptions[type] ?? "";
};

export const collapseCertManagerProjects = (
  projects: Project[],
  activeCertManagerProjectId: string | null
): Project[] => {
  const certManagerProjects = projects.filter((p) => p.type === ProjectType.CertificateManager);
  if (certManagerProjects.length <= 1) return projects;

  const others = projects.filter((p) => p.type !== ProjectType.CertificateManager);
  const display =
    certManagerProjects.find((p) => p.id === activeCertManagerProjectId) ?? certManagerProjects[0];
  const otherCount = certManagerProjects.length - 1;

  return [
    ...others,
    {
      ...display,
      name: "Certificate Manager",
      description:
        otherCount > 0
          ? `Active: ${display.name} · ${otherCount} other instance${otherCount === 1 ? "" : "s"}`
          : display.name
    }
  ];
};

export const getProjectLottieIcon = (type: ProjectType) => {
  const iconConvert: Partial<Record<ProjectType, string>> = {
    [ProjectType.SecretManager]: "vault",
    [ProjectType.KMS]: "unlock",
    [ProjectType.CertificateManager]: "note",
    [ProjectType.SSH]: "terminal",
    [ProjectType.SecretScanning]: "secret-scan",
    [ProjectType.PAM]: "groups"
  };
  return iconConvert[type] || "vault";
};

export const getProjectLucideIcon = (type: ProjectType): LucideIcon => {
  const iconConvert: Partial<Record<ProjectType, LucideIcon>> = {
    [ProjectType.SecretManager]: KeyIcon,
    [ProjectType.KMS]: LockIcon,
    [ProjectType.CertificateManager]: FileKeyIcon,
    [ProjectType.SSH]: TerminalIcon,
    [ProjectType.SecretScanning]: RadarIcon,
    [ProjectType.PAM]: UsersIcon
  };
  return iconConvert[type] || KeyIcon;
};

export type ProjectTileStyle = {
  iconClassName: string;
  containerClassName: string;
  cardHoverClassName: string;
  titleUnderlineClassName: string;
};

export const PROJECT_TILE_STYLE: ProjectTileStyle = {
  iconClassName: "text-project",
  containerClassName:
    "border-project/30 bg-gradient-to-br from-project/20 to-project/5 group-hover:border-project/50 group-hover:from-project/25 group-hover:to-project/10",
  cardHoverClassName: "hover:bg-gradient-to-br hover:from-project/[0.04] hover:to-transparent",
  titleUnderlineClassName: "decoration-project/60"
};
