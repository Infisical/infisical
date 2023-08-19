import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * This function updates user permissions for a certain environment in a project
 * @param {object} obj
 * @param {string} obj.membershipId - membershipId of a certain user in a project
 * @param {*[]} obj.denials - permissions that we are prohibitting users to do
 * @returns
 */
const updateUserProjectPermission = async ({
  membershipId,
  denials
}: {
  membershipId: string;
  denials: {
    ability: string;
    environmentSlug: string;
  }[]
}) =>
  SecurityClient.fetchCall(`/api/v1/membership/${membershipId}/deny-permissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      permissions: denials
    })
  }).then(async (res) => {
    // console.log({
    //   permissions: denials
    // }, res)
    if (res && res.status === 200) {
      return res.json();
    }
    console.log("Failed to update user permissions for a certain environment in a project");
    return undefined;
  });

export default updateUserProjectPermission;
