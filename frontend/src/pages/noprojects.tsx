import { useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';

import Button from '@app/components/basic/buttons/Button';

import getOrganizationUserProjects from './api/organization/GetOrgUserProjects';

export default function NoProjects() {
  const router = useRouter();


  const redirectUser = async () => {
    let workspaces = await getOrganizationUserProjects({
      orgId: String(localStorage.getItem('orgData.id'))
    });
    if (!workspaces) {
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
    <div className="mr-auto flex h-full w-11/12 flex-col items-center justify-center text-center text-lg text-gray-300">
      <div className="mb-6 mt-16 mr-16">
        <Image src="/images/dragon-cant-find.svg" height={270} width={436} alt="google logo" />
      </div>
      <div className="mb-8 rounded-md bg-bunker-500 px-4 py-6 text-bunker-300 shadow-xl">
        <div className="max-w-md">
          You are not part of any projects in this organization yet. When you are, they will appear
          here.
        </div>
        <div className="mt-4 max-w-md">
          Create a new project, or ask other organization members to give you necessary permissions.
        </div>
        <div className="mx-2 mt-6">
          <Button text="Check again" onButtonPressed={redirectUser} size="md" color="mineshaft" />
        </div>
      </div>
    </div>
  );
}

NoProjects.requireAuth = true;
