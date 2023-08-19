import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Checkbox, EmailServiceSetupModal } from "@app/components/v2";
import {
  useGetUser,
  useUpdateMfaEnabled} from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { usePopUp } from "@app/hooks/usePopUp";

export const MFASection = () => {
  const { data: user } = useGetUser();
  const { mutateAsync } = useUpdateMfaEnabled();
  const { createNotification } = useNotificationContext();
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp([
    "setUpEmail"
  ] as const);
  
  const {data: serverDetails } = useFetchServerStatus()
  
  const toggleMfa = async (state: boolean) => {
    try {
      const newUser = await mutateAsync({
        isMfaEnabled: state
      });

      createNotification({
        text: `${newUser.isMfaEnabled ? "Successfully turned on two-factor authentication." : "Successfully turned off two-factor authentication."}`,
        type: "success"
      });
    } catch (err) {
      createNotification({
        text: "Something went wrong while toggling the two-factor authentication.",
        type: "error"
      });
      console.error(err);
    }
  }
  
  return (
    <>
    <form>
      <div className="p-4 mb-6 bg-mineshaft-900 max-w-6xl rounded-lg border border-mineshaft-600">
        <p className="text-xl font-semibold text-mineshaft-100 mb-8">
          Two-factor Authentication
        </p>
        {user && (
          <Checkbox
            className="data-[state=checked]:bg-primary"
            id="isTwoFAEnabled"
            isChecked={user?.isMfaEnabled}
            onCheckedChange={(state) => {
              if (serverDetails?.emailConfigured){
                toggleMfa(state as boolean);
              } else {
                handlePopUpOpen("setUpEmail");
              }
            }}
          >
            Enable 2-factor authentication via your personal email.
          </Checkbox>
        )}
      </div>
    </form>
    <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
      />
    </>
  );
};
