import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * This function deletes certain secrets from a certain project
 * @param {string[]} secretIds - the ids of secrets that we want to be deleted
 * @returns
 */
const deleteSecrets = async ({ secretIds }: { secretIds: string[] }) =>
  SecurityClient.fetchCall("/api/v2/secrets", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      secretIds
    })
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res.json();
    }
    console.log("Failed to delete certain project secrets");
    return undefined;
  });

export default deleteSecrets;
