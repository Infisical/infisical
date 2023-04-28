import { useEffect, useState } from 'react'

import getOrganizations from '@app/pages/api/organization/getOrgs'

const useUserHasOrganization = () => {
    const [hasOrganizations, setHasOrganizations] = useState(true);
    
    const checkOrg = async () => {
        const userOrgs = await getOrganizations();
        if (!userOrgs || userOrgs?.length === 0){
            setHasOrganizations(false);
        }
    }

    useEffect(() => {
        checkOrg();
    }, []);

    return hasOrganizations;
}

export default useUserHasOrganization;