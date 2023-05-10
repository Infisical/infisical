import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';

import { useFetchServerStatus } from '@app/hooks/api/serverDetails';
import { usePopUp } from '@app/hooks/usePopUp';
import addUserToOrg from '@app/pages/api/organization/addUserToOrg';
import getWorkspaces from '@app/pages/api/workspace/getWorkspaces';

import Button from '../basic/buttons/Button';
import { EmailServiceSetupModal } from '../v2';

/**
 * This is the last step of the signup flow. People can optionally invite their teammates here.
 */
export default function TeamInviteStep(): JSX.Element {
  const [emails, setEmails] = useState('');
  const { t } = useTranslation();
  const router = useRouter();
  const { data: serverDetails } = useFetchServerStatus();
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(['setUpEmail'] as const);

  // Redirect user to the getting started page
  const redirectToHome = async () => {
    const userWorkspaces = await getWorkspaces();
    const userWorkspace = userWorkspaces[0]._id;
    router.push(`/home/${userWorkspace}`);
  };

  const inviteUsers = async ({ emails: inviteEmails }: { emails: string }) => {
    inviteEmails
      .split(',')
      .map((email) => email.trim())
      .map(async (email) => addUserToOrg(email, String(localStorage.getItem('orgData.id'))));

    await redirectToHome();
  };

  return (
    <div className="w-max mx-auto min-w-lg h-full pb-4 px-8 mb-64 md:mb-32">
      <p className="text-2xl font-semibold flex justify-center text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200">
        {t('signup.step5-invite-team')}
      </p>
      <p className="text-center flex justify-center text-bunker-400 md:mx-8 mb-6 mt-4">
        {t('signup.step5-subtitle')}
      </p>
      <div className="bg-mineshaft-800 border border-mineshaft-600 w-max mx-auto pt-6 pb-4 px-8 rounded-xl drop-shadow-xl mb-64 md:mb-32">
        <div>
          <div className="text-bunker-300 font-medium pl-1 pb-1 text-sm">
            <span>Emails</span>
          </div>
          <textarea
            className="bg-mineshaft-900 min-w-[30rem] h-20 w-full placeholder:text-bunker-400 py-1 px-2 rounded-md border border-mineshaft-500 text-sm text-bunker-300 outline-none focus:ring-2 ring-primary-800 ring-opacity-70"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="email@example.com, email2@example.com..."
          />
        </div>
        <div className="flex flex-row max-w-max min-w-28 items-center justify-center md:p-2 max-h-24 mx-auto text-lg px-4 mt-4 mb-2">
          <div
            onKeyDown={() => null}
            role="button"
            tabIndex={0}
            className="text-md md:text-sm mx-3 text-bunker-300 bg-mineshaft-700 py-3 md:py-3.5 px-5 rounded-md cursor-pointer hover:bg-mineshaft-500 duration-200"
            onClick={redirectToHome}
          >
            {t('signup.step5-skip')}
          </div>
          <Button
            text={t('signup.step5-send-invites') ?? ''}
            onButtonPressed={() => {
              if (serverDetails?.emailConfigured) {
                inviteUsers({ emails })
              } else {
                handlePopUpOpen('setUpEmail');
              }
            }}
            size="lg"
          />
        </div>
        <EmailServiceSetupModal
          isOpen={popUp.setUpEmail?.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle('setUpEmail', isOpen)}
        />
      </div>
    </div>
  );
}
