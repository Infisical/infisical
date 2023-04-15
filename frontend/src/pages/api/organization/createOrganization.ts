import SecurityClient from "@app/components/utilities/SecurityClient";

/**
 * This route lets us create a new org
 * @param {*} orgName
 * @returns
 */
const createOrganization =  (orgName: string) => {
    SecurityClient.fetchCall('/api/v1/organization', {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        }, 
        body: JSON.stringify({
            organizationName: orgName
        })
    }).then(async (res) => {
        if (res?.status === 200) {
            return (await res.json()).organization;
        }

        console.log('Failed to get orgs of a user');
        return undefined;
    });
}

export default createOrganization;
