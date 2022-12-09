import SecurityClient from "~/utilities/SecurityClient.js";

/**
 * This function fetches the bot for a project
 * @param {Object} obj
 * @param {String} obj.workspaceId
 * @returns
 */
const setBotActiveStatus = async ({ botId, isActive, botKey }) => {
  return SecurityClient.fetchCall(
      "/api/v1/bot/" + botId + "/active",
    {
        method: "PATCH",
        headers: {
        "Content-Type": "application/json",
        },
        body: JSON.stringify({
            isActive,
            botKey
        })
    }
  ).then(async (res) => {
    if (res.status == 200) {
      return await res.json();
    } else {
      console.log("Failed to get bot for project");
    }
  });
};

export default setBotActiveStatus;