import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import ActivityTable from '~/components/basic/table/ActivityTable';
import NavHeader from '~/components/navigation/NavHeader';
import onboardingCheck from '~/components/utilities/checks/OnboardingCheck';

const data = [
  {
    eventName: 'Secrets Pulled',
    user: 'matsiiako@gmail.com',
    source: 'CLI',
    time: new Date()
  },
  {
    eventName: 'Secrets Pushed',
    user: 'matsiiako@gmail.com',
    source: 'Web',
    time: new Date()
  }
];

/**
 * This tab is called Home because in the future it will include some company news,
 * updates, roadmap, relavant blogs, etc. Currently it only has the setup instruction
 * for the new users
 */
export default function Activity() {
  const router = useRouter();
  const [hasUserClickedSlack, setHasUserClickedSlack] = useState(false);
  const [hasUserClickedIntro, setHasUserClickedIntro] = useState(false);
  const [hasUserStarred, setHasUserStarred] = useState(false);
  const [hasUserPushedSecrets, setHasUserPushedSecrets] = useState(false);
  const [usersInOrg, setUsersInOrg] = useState(false);

  useEffect(() => {
    onboardingCheck({
      setHasUserClickedIntro,
      setHasUserClickedSlack,
      setHasUserPushedSecrets,
      setHasUserStarred,
      setUsersInOrg
    });
  }, []);

  return (
    <div className="mx-6 lg:mx-0 w-full overflow-y-scroll h-screen">
      <NavHeader pageName="Project Activity" isProjectRelated={true} />
      <div className="flex flex-col justify-between items-start mx-4 mt-6 mb-4 text-xl max-w-5xl px-2">
        <div className="flex flex-row justify-start items-center text-3xl">
          <p className="font-semibold mr-4 text-bunker-100">Activity Logs</p>
        </div>
        <p className="mr-4 text-base text-gray-400">
          Manage your integrations of Infisical with third-party services.
        </p>
      </div>
      <ActivityTable data={data} />
    </div>
  );
}

Activity.requireAuth = true;
