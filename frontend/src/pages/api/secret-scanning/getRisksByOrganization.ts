import SecurityClient from "@app/components/utilities/SecurityClient";

export type GitRisks = {
  _id: string;
  description: string;
  startLine: string;
  endLine: string;
  startColumn: string;
  endColumn: string;
  match: string;
  secret: string;
  file: string;
  symlinkFile: string;
  commit: string;
  entropy: string;
  author: string;
  email: string;
  date: string;
  message: string;
  tags: string[];
  ruleID: string;
  fingerprint: string;
  status: string;

  isFalsePositive: boolean; // New field for marking risks as false positives
  isResolved: boolean; // New field for marking risks as resolved
  riskOwner: string | null; // New field for setting a risk owner (nullable string)
  installationId: string,
  repositoryId: string,
  repositoryLink: string
  repositoryFullName: string
  pusher: {
    name: string,
    email: string
  },
  createdAt: string,
  organization: string,
}

/**
 * Will create a new integration session and return it for the given org
 * @returns 
 */
export const getRisksByOrganization = async (organizationId: string): Promise<GitRisks[]> => {
  try {
    const res = await SecurityClient.fetchCall(`/api/v1/secret-scanning/organization/${organizationId}/risks`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      const data = (await res.json()).risks;
      return data;
    } 
      console.error("Failed to fetch risks");
      console.error("Response:", res);
      return [];
    
  } catch (err) {
    console.error("Failed to fetch risks:", err);
    return [];
  }
};