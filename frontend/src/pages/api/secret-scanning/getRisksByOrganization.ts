import SecurityClient from "@app/components/utilities/SecurityClient";

export type IGitRisks = {
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
const getRisksByOrganization = (oranizationId: string): Promise<IGitRisks[]> =>
  SecurityClient.fetchCall(`/api/v1/secret-scanning/organization/${oranizationId}/risks`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    },
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).risks;
    }
    console.log("Failed to fetch risks");
    return undefined;
  });

export default getRisksByOrganization;
