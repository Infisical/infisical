import SecurityClient from "~/utilities/SecurityClient";

/**
 * This function uploads the encrypted .env file
 * @param {*} req
 * @param {*} res
 * @returns
 */
const uploadSecrets = async ({ workspaceId, secrets, keys, environment }) => {
  return SecurityClient.fetchCall("/api/v1/secret/" + workspaceId, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      secrets,
      keys,
      environment,
      channel: "web",
    }),
  }).then(async (res) => {
    if (res.status == 200) {
      return res;
    } else {
      console.log("Failed to push secrets");
    }
  });
};

export default uploadSecrets;
