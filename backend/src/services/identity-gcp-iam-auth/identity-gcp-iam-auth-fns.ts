/**
 * Extracts the GCP service account email into the name and project ID parts where
 * the email is in the format: <service-account-name>@<project-id>.iam.gserviceaccount.com
 */
export const extractGcpServiceAccountEmail = (email: string) => {
  const regex = /^(.+)@(.+)\.iam\.gserviceaccount\.com$/;
  const match = email.match(regex);

  if (!match) {
    throw new Error("Invalid GCP service account email format.");
  }

  const name = match[1];
  const projectId = match[2];

  return { name, projectId };
};
