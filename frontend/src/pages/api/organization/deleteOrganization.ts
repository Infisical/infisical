import SecurityClient from "@app/components/utilities/SecurityClient";

const deleteOrganization = (organizationId: string) => {
    SecurityClient.fetchCall(`api/v2/organizations/${organizationId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    }).then(async (res) => {
        if (res?.status === 200){
            return (await res.json());
        }
        console.log('Failed to delete organization');
        return undefined;
    })
}

export default deleteOrganization;