import { useQueryClient } from "@tanstack/react-query";

import TotpRegistration from "@app/components/mfa/TotpRegistration";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  ContentLoader,
  DeleteActionModal,
  EmailServiceSetupModal,
  FormControl,
  Select,
  SelectItem,
  Switch
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { useGetUser, userKeys, useUpdateUserMfa } from "@app/hooks/api";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import {
  useCreateNewTotpRecoveryCodes,
  useDeleteUserTotpConfiguration
} from "@app/hooks/api/users/mutation";
import { useGetUserTotpConfiguration } from "@app/hooks/api/users/queries";
import { AuthMethod } from "@app/hooks/api/users/types";
import { usePopUp } from "@app/hooks/usePopUp";

export const MFASection = () => {
  const { data: user } = useGetUser();
  const { mutateAsync } = useUpdateUserMfa();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "setUpEmail",
    "deleteTotpConfig"
  ] as const);
  const [shouldShowRecoveryCodes, setShouldShowRecoveryCodes] = useToggle();
  const { data: totpConfiguration, isPending: isTotpConfigurationLoading } =
    useGetUserTotpConfiguration();
  const { mutateAsync: deleteTotpConfiguration } = useDeleteUserTotpConfiguration();
  const { mutateAsync: createTotpRecoveryCodes } = useCreateNewTotpRecoveryCodes();
  const queryClient = useQueryClient();
  const { data: serverDetails } = useFetchServerStatus();

  const handleTotpDeletion = async () => {
    try {
      await deleteTotpConfiguration();

      createNotification({
        text: "Successfully deleted mobile authenticator",
        type: "success"
      });

      handlePopUpClose("deleteTotpConfig");
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to delete mobile authenticator";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  const handleGenerateMoreRecoveryCodes = async () => {
    try {
      await createTotpRecoveryCodes();

      createNotification({
        text: "Successfully generated new recovery codes",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to generate new recovery codes";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  const updateSelectedMfa = async (mfaMethod: MfaMethod) => {
    try {
      if (!user) return;

      await mutateAsync({
        selectedMfaMethod: mfaMethod
      });

      createNotification({
        text: "Successfully updated selected 2FA method",
        type: "success"
      });
    } catch (err) {
      createNotification({
        text: "Something went wrong while updating selected 2FA method.",
        type: "error"
      });
      console.error(err);
    }
  };

  const toggleMfa = async (state: boolean) => {
    try {
      if (!user) return;
      if (user.authMethods.includes(AuthMethod.LDAP)) {
        createNotification({
          text: "Two-factor authentication is not available for LDAP users.",
          type: "error"
        });
        return;
      }

      const newUser = await mutateAsync({
        isMfaEnabled: state
      });

      createNotification({
        text: `${
          newUser.isMfaEnabled
            ? "Successfully turned on two-factor authentication."
            : "Successfully turned off two-factor authentication."
        }`,
        type: "success"
      });
    } catch (err) {
      createNotification({
        text: "Something went wrong while toggling the two-factor authentication.",
        type: "error"
      });
      console.error(err);
    }
  };

  return (
    <>
      <div className="mb-6 max-w-6xl rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <p className="mb-4 text-xl font-semibold text-mineshaft-100">Two-factor Authentication</p>
        {user && (
          <Switch
            className="data-[state=checked]:bg-primary"
            id="isTwoFAEnabled"
            isChecked={user?.isMfaEnabled}
            onCheckedChange={(state) => {
              if (serverDetails?.emailConfigured) {
                toggleMfa(state as boolean);
              } else {
                handlePopUpOpen("setUpEmail");
              }
            }}
          >
            Enable 2-factor authentication
          </Switch>
        )}
        {user?.isMfaEnabled && (
          <FormControl label="Selected 2FA method" className="mt-3">
            <Select
              className="min-w-[20rem] border border-mineshaft-500"
              onValueChange={updateSelectedMfa}
              defaultValue={user.selectedMfaMethod ?? MfaMethod.EMAIL}
            >
              <SelectItem value={MfaMethod.EMAIL} key="mfa-method-email">
                Email
              </SelectItem>
              <SelectItem value={MfaMethod.TOTP} key="mfa-method-totp">
                Mobile Authenticator
              </SelectItem>
            </Select>
          </FormControl>
        )}
        <div className="mt-8 text-lg font-semibold text-mineshaft-100">Mobile Authenticator</div>
        {isTotpConfigurationLoading ? (
          <ContentLoader />
        ) : (
          <div>
            {totpConfiguration?.isVerified ? (
              <div className="mt-2">
                <div className="flex flex-row gap-2">
                  <Button colorSchema="secondary" onClick={setShouldShowRecoveryCodes.toggle}>
                    {shouldShowRecoveryCodes ? "Hide recovery codes" : "Show recovery codes"}
                  </Button>
                  <Button colorSchema="secondary" onClick={handleGenerateMoreRecoveryCodes}>
                    Generate more codes
                  </Button>
                  <Button colorSchema="danger" onClick={() => handlePopUpOpen("deleteTotpConfig")}>
                    Delete
                  </Button>
                </div>
                {shouldShowRecoveryCodes && totpConfiguration.recoveryCodes && (
                  <div className="mt-4 bg-mineshaft-600 p-4">
                    {totpConfiguration.recoveryCodes.map((code) => (
                      <div key={code}>{code}</div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="text-sm text-gray-400">
                  For added security, you can configure a mobile authenticator and set it as your
                  selected 2FA method.
                </div>
                <div className="ml-6 mt-6 flex min-w-full">
                  <TotpRegistration
                    onComplete={async () => {
                      await queryClient.invalidateQueries({ queryKey: userKeys.totpConfiguration });
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
      />
      <DeleteActionModal
        isOpen={popUp.deleteTotpConfig.isOpen}
        title="Are you sure you want to delete the configured authenticator?"
        subTitle="This action is irreversible. You’ll have to go through the setup process to enable it again."
        onChange={(isOpen) => handlePopUpToggle("deleteTotpConfig", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleTotpDeletion}
      />
    </>
  );
};
