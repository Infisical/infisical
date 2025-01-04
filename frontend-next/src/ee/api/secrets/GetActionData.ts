import SecurityClient from "@app/components/utilities/SecurityClient";

interface WorkspaceProps {
  actionId: string;
}

/**
 * This function fetches the data for a certain action performed by a user
 * @param {object} obj
 * @param {string} obj.actionId - id of an action for which we are trying to get data
 * @returns
 */
const getActionData = async ({ actionId }: WorkspaceProps) =>
  SecurityClient.fetchCall(`/api/v1/action/${actionId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).action;
    }
    console.log("Failed to get the info about an action");
    return undefined;
  });

export default getActionData;
