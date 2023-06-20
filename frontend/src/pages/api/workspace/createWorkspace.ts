import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * This route creates a new workspace for a user within a certain organization.
 * @param {string} workspaceName - project Name
 * @param {string} organizationId - org ID
 * @returns
 */
const createWorkspace = ({
  workspaceName,
  organizationId
}: {
  workspaceName: string;
  organizationId: string;
}) =>
  SecurityClient.fetchCall("/api/v1/workspace", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      workspaceName,
      organizationId
    })
  }).then(async (res) => {
    if (res?.status === 200) {
      return (await res.json()).workspace;
    }
    console.log("Failed to create a project");
    return undefined;
  });

export default createWorkspace;
