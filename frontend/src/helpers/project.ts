import { apiRequest } from "@app/config/request";
import { createWorkspace } from "@app/hooks/api/projects/queries";
import { ProjectEnv, ProjectType } from "@app/hooks/api/projects/types";

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
    secretValue: "OVERRIDE_THIS",
    secretComment: "Another secret override"
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

export const getProjectBaseURL = (type: ProjectType) => {
  switch (type) {
    case ProjectType.SecretManager:
      return "/organizations/$orgId/projects/secret-management/$projectId";
    case ProjectType.CertificateManager:
      return "/organizations/$orgId/projects/cert-management/$projectId";
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
      return "/organizations/$orgId/projects/cert-management/$projectId/policies" as const;
    case ProjectType.SecretScanning:
      return `/organizations/$orgId/projects/${type}/$projectId/data-sources` as const;
    case ProjectType.PAM:
      return `/organizations/$orgId/projects/${type}/$projectId/accounts` as const;
    default:
      return `/organizations/$orgId/projects/${type}/$projectId/overview` as const;
  }
};

export const getProjectTitle = (type: ProjectType) => {
  const titleConvert = {
    [ProjectType.SecretManager]: "Secrets Management",
    [ProjectType.KMS]: "Key Management",
    [ProjectType.CertificateManager]: "Cert Management",
    [ProjectType.SSH]: "SSH",
    [ProjectType.SecretScanning]: "Secret Scanning",
    [ProjectType.PAM]: "PAM"
  };
  return titleConvert[type];
};

export const getProjectLottieIcon = (type: ProjectType) => {
  const titleConvert = {
    [ProjectType.SecretManager]: "vault",
    [ProjectType.KMS]: "unlock",
    [ProjectType.CertificateManager]: "note",
    [ProjectType.SSH]: "terminal",
    [ProjectType.SecretScanning]: "secret-scan",
    [ProjectType.PAM]: "groups"
  };
  return titleConvert[type];
};
