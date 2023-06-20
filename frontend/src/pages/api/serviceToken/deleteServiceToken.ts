import SecurityClient from "@app/components/utilities/SecurityClient";

interface Props {
  serviceTokenId: string;
}

/**
 * This route revokes a specific service token
 * @param {object} obj
 * @param {string} obj.serviceTokenId - id of a cervice token that we want to delete
 * @returns
 */
const deleteServiceToken = ({ serviceTokenId }: Props) =>
  SecurityClient.fetchCall(`/api/v2/service-token/${serviceTokenId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    }
  }).then(async (res) => {
    if (res && res.status === 200) {
      return res.json();
    }
    console.log("Failed to delete a service token");
    return undefined;
  });

export default deleteServiceToken;
