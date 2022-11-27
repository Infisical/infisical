import SecurityClient from "~/utilities/SecurityClient";

import { PATH } from "~/const";

/**
 * This function change the access of a user in a certain workspace
 * @param {*} membershipId
 * @param {*} role
 * @returns
 */
const changeUserRoleInWorkspace = (membershipId, role) => {
  return SecurityClient.fetchCall(
    PATH + "/api/v1/membership/" + membershipId + "/change-role",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: role,
      }),
    }
  ).then(async (res) => {
    if (res.status == 200) {
      return res;
    } else {
      console.log("Failed to change the user role in a project");
    }
  });
};

export default changeUserRoleInWorkspace;
