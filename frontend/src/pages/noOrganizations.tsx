import { useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';

import Button from '@app/components/basic/buttons/Button';
import { getTranslatedServerSideProps } from '@app/components/utilities/withTranslateProps';

import getOrganizationUserProjects from './api/organization/GetOrgUserProjects';

export default function NoOrganizations() {
  const router = useRouter();

  const redirectUser = async () => {
    let workspaces = await getOrganizationUserProjects({ orgId: String(localStorage.getItem("orgData.id")) });

    if (!workspaces){
      workspaces = [];
    } 
    
    if (workspaces.length > 0) {
      router.push(`/dashboard/${workspaces[0]._id}`);
    }
  };

  useEffect(() => {
    // on initial load - run auth check
    (async () => {
      await redirectUser();
    })();
  }, []);

  return (
    <div className="h-full flex flex-col items-center justify-center text-gray-300 text-lg text-center w-11/12 mr-auto">
      <div className="mb-6 mt-16 mr-16">
        <Image src="/images/dragon-cant-find.svg" height={270} width={436} alt="google logo" />
      </div>
      <div className="px-4 rounded-md bg-bunker-500 mb-8 text-bunker-300 shadow-xl py-6">
        <div className="max-w-md">
          You are not part of any organization yet. When you are, they will appear
          here.
        </div>
        <div className="max-w-md mt-4">
          Create a new Organization, or ask other organization members to invite you.
        </div>
        <div className="mt-6 mx-2">
          <Button text="Check again" onButtonPressed={redirectUser} size="md" color="mineshaft" />
        </div>
      </div>
    </div>
  );
}

NoOrganizations.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['noprojects']);
