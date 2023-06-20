import SecurityClient from "@app/components/utilities/SecurityClient";

interface SnapshotProps {
  secretSnapshotId: string;
}

/**
 * This function fetches the secrets for a certain secret snapshot
 * @param {object} obj
 * @param {string} obj.secretSnapshotId - snapshot id for which we are trying to get secrets
 * @returns
 */
const getSecretSnapshotData = async ({ secretSnapshotId }: SnapshotProps) =>
  SecurityClient.fetchCall(`/api/v1/secret-snapshot/${secretSnapshotId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).secretSnapshot;
    }
    console.log("Failed to get the secrets of a certain snapshot");
    return undefined;
  });

export default getSecretSnapshotData;
