import { apiRequest } from "@app/config/request";
import { createWorkspace } from "@app/hooks/api/workspace/queries";
import { ProjectType } from "@app/hooks/api/workspace/types";

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
    projectName
  });

  try {
    const { data } = await apiRequest.post("/api/v3/secrets/batch/raw", {
      workspaceId: project.id,
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
export const getProjectHomePage = (type: ProjectType) => {
  switch (type) {
    case ProjectType.CertificateManager:
      return `/projects/$projectId/${type}/subscribers` as const;
    case ProjectType.SecretScanning:
      return `/projects/$projectId/${type}/data-sources` as const;
    default:
      return `/projects/$projectId/${type}/overview` as const;
  }
};

export const getProjectTitle = (type: ProjectType) => {
  const titleConvert = {
    [ProjectType.SecretManager]: "Secret Management",
    [ProjectType.KMS]: "Key Management",
    [ProjectType.CertificateManager]: "Cert Management",
    [ProjectType.SSH]: "SSH",
    [ProjectType.SecretScanning]: "Secret Scanning"
  };
  return titleConvert[type];
};

export const getCurrentProductFromUrl = (location: string) => {
  const type = Object.values(ProjectType).find((el) => location.includes(`/${el}`));
  return type;
};
