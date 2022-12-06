import SecurityClient from "~/utilities/SecurityClient";

/**
 * This route lets us get the workspaces of a certain user
 * @returns
 */
const getWorkspaces = () => {
  return SecurityClient.fetchCall("/api/v1/workspace", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }).then(async (res) => {
    if (res?.status == 200) {
      return (await res.json()).workspaces;
    } else {
      console.log("Failed to get projects");
    }
  });
};

export default getWorkspaces;
