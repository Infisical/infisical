import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * This function performs a rollback of secrets in a certain project
 * @param {object} obj
 * @param {string} obj.workspaceId - id of the project for which we are rolling back data
 * @param {number} obj.version - version to which we are rolling back
 * @returns
 */
const performSecretRollback = async ({
  workspaceId,
  version
}: {
  workspaceId: string;
  version: number;
}) =>
  SecurityClient.fetchCall(`/api/v1/workspace/${workspaceId}/secret-snapshots/rollback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      version
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res.json();
    }
    console.log("Failed to perform the secret rollback");
    return undefined;
  });

export default performSecretRollback;
