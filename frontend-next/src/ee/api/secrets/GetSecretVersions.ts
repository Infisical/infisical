import SecurityClient from "@app/components/utilities/SecurityClient";

interface SecretVersionProps {
  secretId: string;
  offset: number;
  limit: number;
}

/**
 * This function fetches the versions of a specific secret
 * @param {object} obj
 * @param {string} obj.secretId - the id of a secret for which we are fetching the version history
 * @param {number} obj.offset - the start of our query
 * @param {number} obj.limit - how far our query goes
 * @returns
 */
const getSecretVersions = async ({ secretId, offset, limit }: SecretVersionProps) =>
  SecurityClient.fetchCall(
    `/api/v1/secret/${secretId}/secret-versions?${new URLSearchParams({
      offset: String(offset),
      limit: String(limit)
    })}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    }
  ).then(async (res) => {
    if (res && res.status === 200) {
      return res.json();
    }
    console.log("Failed to get secret version history");
    return undefined;
  });

export default getSecretVersions;
