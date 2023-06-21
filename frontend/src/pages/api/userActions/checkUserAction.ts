import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * This route registers a certain action for a user
 * @param {*} email
 * @param {*} workspaceId
 * @returns
 */
const checkUserAction = ({ action }: { action: string }) =>
  SecurityClient.fetchCall(
    "/api/v1/user-action" +
      `?${new URLSearchParams({
        action
      })}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    }
  ).then(async (res) => {
    if (res && res.status === 200) {
      return (await res.json()).userAction;
    }
    console.log("Failed to check a user action");
    return undefined;
  });

export default checkUserAction;
