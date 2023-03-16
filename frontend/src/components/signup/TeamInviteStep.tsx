import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

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
  const {data: serverDetails } = useFetchServerStatus()
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp([
    'setUpEmail'
  ] as const);

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
    <div className="bg-bunker w-max mx-auto h-7/12 pt-6 pb-4 px-8 rounded-xl drop-shadow-xl mb-64 md:mb-32">
      <p className="text-4xl font-semibold flex justify-center text-primary">
        {t('signup:step5-invite-team')}
      </p>
      <p className="text-center flex justify-center text-bunker-300 max-w-xs md:max-w-sm md:mx-8 mb-6 mt-4">
        {t('signup:step5-subtitle')}
      </p>
      <div>
        <div className="overflow-auto bg-bunker-800">
          <div className="whitespace-pre-wrap break-words bg-transparent" />
        </div>
        <textarea
          className="bg-bunker-800 h-20 w-full placeholder:text-bunker-400 py-1 px-2 rounded-md border border-mineshaft-500 text-sm text-bunker-300 outline-none focus:ring-2 ring-primary-800 ring-opacity-70"
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
          {t('signup:step5-skip')}
        </div>
        <Button
          text={t('signup:step5-send-invites') ?? ''}
          onButtonPressed={() => {
            if(serverDetails?.emailConfigured){
              inviteUsers({ emails })
            }else{
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
  );
}
