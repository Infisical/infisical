import SecurityClient from "~/utilities/SecurityClient";

import { PATH } from "~/const";

/**
 * This route deletes a specified workspace.
 * @param {*} workspaceId
 * @returns
 */
const deleteWorkspace = (workspaceId) => {
  return SecurityClient.fetchCall(PATH + "/api/v1/workspace/" + workspaceId, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  }).then(async (res) => {
    if (res.status == 200) {
      return res;
    } else {
      console.log("Failed to delete a project");
    }
  });
};

export default deleteWorkspace;
