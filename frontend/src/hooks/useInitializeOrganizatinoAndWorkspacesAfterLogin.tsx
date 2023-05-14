import { useRouter } from 'next/router';
import React, { useEffect } from 'react'
import getOrganizationUserProjects from '~/pages/api/organization/GetOrgUserProjects';
import getOrganizations from '~/pages/api/organization/getOrgs';

const useInitializeOrganizationAndWorkspacesAfterLogin = () => {
    const router = useRouter();

    useEffect(() => {
        async function setupUserLogin() {
          const userOrgs = await getOrganizations(); 
          let orgUserProjects: any = [];
          
          if (userOrgs?.length !== 0){
            const orgId = userOrgs[0]?._id;
            localStorage.setItem('orgData.id', orgId);
      
            orgUserProjects = await getOrganizationUserProjects({
              orgId
            });
            
            if (orgUserProjects.length > 0) {
              localStorage.setItem('projectData.id', orgUserProjects[0]?._id);
            }
          } else {
            localStorage.setItem('orgData.id', '');
            localStorage.setItem('projectData.id', '');
          }

          // navigate user also 
          if (userOrgs?.length > 0 && 
            orgUserProjects?.length === 0 && 
            router.asPath !== '/noprojects' &&
            !router.asPath.includes('home') &&
            !router.asPath.includes('settings')) {
              router.push('/noprojects');
          } else if (userOrgs?.length === 0 && 
            orgUserProjects?.length === 0 &&
            router.asPath !== '/noOrganizations' &&
            !router.asPath.includes('settings')){
              router.push('/noOrganizations');
          }
        }
    
        setupUserLogin();
      }, [])
}

export default useInitializeOrganizationAndWorkspacesAfterLogin