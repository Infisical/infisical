import { useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';

import Button from '~/components/basic/buttons/Button';
import { getTranslatedServerSideProps } from '~/utilities/withTranslateProps';

import getWorkspaces from './api/workspace/getWorkspaces';

export default function NoProjects() {
  const router = useRouter();

  const redirectUser = async () => {
    const workspaces = await getWorkspaces();
    if (workspaces.length > 0) {
      router.push('/dashboard/' + workspaces[0]._id);
    }
  }

  useEffect(() => {
    // on initial load - run auth check
    (async () => {
      await redirectUser()
    })();
  }, []);

  return (
    <div className='h-full flex flex-col items-center justify-center text-gray-300 text-lg text-center w-11/12 mr-auto'>
      <div className='mb-6 mt-16 mr-16'>
        <Image
          src='/images/dragon-cant-find.svg'
          height={270}
          width={436}
          alt='google logo'
        ></Image>
      </div>
      <div className='px-4 rounded-md bg-bunker-500 mb-8 text-bunker-300 shadow-xl py-6'>
        <div className='max-w-md'>
          You are not part of any projects in this organization yet. When you
          do, they will appear here.
        </div>
        <div className='max-w-md mt-4'>
          Create a new project, or ask other organization members to give you
          neccessary permissions.
        </div>
        <div className='mt-6 mx-2'>
          <Button text="Check again" onButtonPressed={redirectUser} size="md" color="mineshaft"/>
        </div>
      </div>
    </div>
  );
}

NoProjects.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['noprojects']);
