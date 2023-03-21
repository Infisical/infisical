import { useEffect, useState } from 'react';

import { useNotificationContext } from '@app/components/context/Notifications/NotificationProvider';
import { Checkbox, EmailServiceSetupModal } from '@app/components/v2';
import { useFetchServerStatus } from '@app/hooks/api/serverDetails';
import { usePopUp } from '@app/hooks/usePopUp';

import { useGetUser } from '../../../../hooks/api';
import { User } from '../../../../hooks/api/types';
import updateMyMfaEnabled from '../../../../pages/api/user/updateMyMfaEnabled';

export const SecuritySection = () => {
  const [isMfaEnabled, setIsMfaEnabled] = useState(false);
  const { data: user } = useGetUser();
  const { createNotification } = useNotificationContext();
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp([
    'setUpEmail'
  ] as const);
  
  const {data: serverDetails } = useFetchServerStatus()
  
  useEffect(() => {
    if (user && typeof user.isMfaEnabled !== 'undefined') {
      setIsMfaEnabled(user.isMfaEnabled);
    }
  }, [user]);
  
  const toggleMfa = async (state: boolean) => {
    try {
      const newUser: User = await updateMyMfaEnabled({
        isMfaEnabled: state
      });

      if (newUser) {
        setIsMfaEnabled(newUser.isMfaEnabled);
      }

      createNotification({
        text: `${newUser.isMfaEnabled ? 'Successfully turned on two-factor authentication.' : 'Successfully turned off two-factor authentication.'}`,
        type: 'success'
      });
    } catch (err) {
      createNotification({
        text: 'Something went wrong while toggling the two-factor authentication.',
        type: 'error'
      });
      console.error(err);
    }
  }
  
  return (
    <>
    <form>
      <div className="mb-6 mt-2 flex w-full flex-col items-start rounded-md bg-white/5 px-6 pb-6 pt-2">
        <p className="mb-4 mt-2 text-xl font-semibold">
          Two-factor Authentication
        </p>
        <Checkbox
          className="data-[state=checked]:bg-primary"
          id="isTwoFAEnabled"
          isChecked={isMfaEnabled}
          onCheckedChange={(state) => {
            if (serverDetails?.emailConfigured){
              toggleMfa(state as boolean);
            } else {
              handlePopUpOpen('setUpEmail');
            }
          }}
        >
          Enable 2-factor authentication via your personal email.
        </Checkbox>
      </div>
    </form>
    <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle('setUpEmail', isOpen)}
      />
    </>
  );
};
