import React, { useEffect } from 'react'
import getOrganizationUserProjects from '~/pages/api/organization/GetOrgUserProjects';
import getOrganizations from '~/pages/api/organization/getOrgs';

const useInitializeOrganizatinoAndWorkspacesAfterLogin = () => {
    useEffect(() => {
        async function setupUserLogin() {
          const userOrgs = await getOrganizations(); 
          
          if (userOrgs?.length !== 0){
            const orgId = userOrgs[0]?._id;
            localStorage.setItem('orgData.id', orgId);
      
            const orgUserProjects = await getOrganizationUserProjects({
              orgId
            });
            
            if (orgUserProjects.length > 0) {
              localStorage.setItem('projectData.id', orgUserProjects[0]?._id);
            }
          } else {
            localStorage.setItem('orgData.id', '');
            localStorage.setItem('projectData.id', '');
          }
        }
    
        setupUserLogin();
      }, [])
}

export default useInitializeOrganizatinoAndWorkspacesAfterLogin