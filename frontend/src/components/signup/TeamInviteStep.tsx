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
    <div className="h-7/12 mx-auto mb-64 w-max rounded-xl bg-bunker px-8 pt-6 pb-4 drop-shadow-xl md:mb-32">
      <p className="flex justify-center text-4xl font-semibold text-primary">
        {t('signup.step5-invite-team')}
      </p>
      <p className="mb-6 mt-4 flex max-w-xs justify-center text-center text-bunker-300 md:mx-8 md:max-w-sm">
        {t('signup.step5-subtitle')}
      </p>
      <div>
        <div className="overflow-auto bg-bunker-800">
          <div className="whitespace-pre-wrap break-words bg-transparent" />
        </div>
        <textarea
          className="h-20 w-full rounded-md border border-mineshaft-500 bg-bunker-800 py-1 px-2 text-sm text-bunker-300 outline-none ring-primary-800 ring-opacity-70 placeholder:text-bunker-400 focus:ring-2"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="email@example.com, email2@example.com..."
        />
      </div>
      <div className="min-w-28 mx-auto mt-4 mb-2 flex max-h-24 max-w-max flex-row items-center justify-center px-4 text-lg md:p-2">
        <div
          onKeyDown={() => null}
          role="button"
          tabIndex={0}
          className="text-md mx-3 cursor-pointer rounded-md bg-mineshaft-700 py-3 px-5 text-bunker-300 duration-200 hover:bg-mineshaft-500 md:py-3.5 md:text-sm"
          onClick={redirectToHome}
        >
          {t('signup.step5-skip')}
        </div>
        <Button
          text={t('signup.step5-send-invites') ?? ''}
          onButtonPressed={() => {
            if (serverDetails?.emailConfigured) {
              inviteUsers({ emails });
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
  );
}
