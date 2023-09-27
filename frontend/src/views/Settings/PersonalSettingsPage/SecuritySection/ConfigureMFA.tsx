import { FC, useEffect,useState } from "react";
import { useRouter } from "next/router";
import { faAt, faBan, faBook,faGhost, faLock, faMagnifyingGlass, faQrcode, faRocket, faScroll } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, EmailServiceSetupModal } from "@app/components/v2";
import { RedirectButton } from "@app/helpers/redirectHelper";
import { disableMfaAll, disableMfaAuthApp, disableMfaEmail, enableMfaEmail, updateMfaPreference,useGetUser } from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { MfaMethod } from "@app/hooks/api/users/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { MfaRecoveryCodesModal } from "./components/MfaRecoveryCodesModal"

export const ConfigureMFA: FC = () => {
  const [ selectedMfaPreference, setSelectedMfaPreference ] = useState<MfaMethod>();
  const { data: user, error: userError, isLoading: userLoading } = useGetUser();
  const { data: serverDetails } = useFetchServerStatus();
  const [mfaRecoveryCodesLeft,setMfaRecoveryCodesLeft] = useState<number>(0);
  const [showViewMfaRecoveryCodesButton, setShowViewMfaRecoveryCodesButton] = useState<boolean>(true);
  const [showMfaRecoveryCodesModal, setShowMfaRecoveryCodesModal] = useState<boolean>(false);
  const { createNotification } = useNotificationContext();
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp([
    "setUpEmail"
  ] as const);
  const router = useRouter();

  let windowReloadTimeout: NodeJS.Timeout | undefined;
  let redirectToMfaSetupPageTimeout: NodeJS.Timeout | undefined;
  const WINDOW_RELOAD_TIMEOUT = 2000;
  const PAGE_REDIRECT_TIMEOUT = 250;

  if (!user || userError) {
    return <p>Error getting user.</p>;
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    setSelectedMfaPreference(user.mfaPreference as MfaMethod);
  }, [user.mfaPreference, user.mfaMethods]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (user.mfaRecoveryCodesCount && user.mfaRecoveryCodesCount.length > 0) {
      const currentCount = user.mfaRecoveryCodesCount?.[0]?.currentCount;
      if (currentCount !== undefined) {
        setMfaRecoveryCodesLeft(currentCount);
      }
    }
  }, [user.mfaRecoveryCodesCount]);

  const handleDisableMfaAll = async () => {
    try {
      if (user.isMfaEnabled) {
        await disableMfaAll()
        createNotification({
            text: "Successfully disabled MFA",
            type: "success"
        });
        windowReloadTimeout = setTimeout(() => {
          window.location.reload();
        }, WINDOW_RELOAD_TIMEOUT);
        return () => {
          clearTimeout(windowReloadTimeout);
        };
      };
    } catch (err) {
      console.error("Failed to disable MFA", err);
      createNotification({
        text: "Failed to disable MFA",
        type: "error"
      });
    };
    return null;
  };
  
  const handleUpdateMfaPreference = async ({ selectedMfaPreference }: { selectedMfaPreference: MfaMethod }) => { // eslint-disable-line @typescript-eslint/no-shadow
    try {
      if (user.isMfaEnabled && user.mfaPreference !== selectedMfaPreference) {
        await updateMfaPreference({ mfaPreference: selectedMfaPreference });
        createNotification({
          text: "Successfully updated MFA preference",
          type: "success"
        });
      };
    } catch (err) {
      console.error("Failed to update preferred MFA method", err);
      createNotification({
        text: "Failed to update MFA preference",
        type: "error"
      });
    };
  };

  const handlePreferenceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;
    setSelectedMfaPreference(selectedValue as MfaMethod);
    if (selectedValue) {
      handleUpdateMfaPreference({ selectedMfaPreference: selectedValue as MfaMethod });
    }
  };

  const redirectToMfaSetupPage = () => {
    try {
      createNotification({
        text: "Redirecting to MFA (authenticator app) setup page...",
        type: "info"
      });

      redirectToMfaSetupPageTimeout = setTimeout(() => {
        router.push("/mfa-setup");
      }, PAGE_REDIRECT_TIMEOUT);

      return () => {
        clearTimeout(redirectToMfaSetupPageTimeout);
      };
    } catch (err: any) {
      console.error("Redirect to MFA (authenticator app) setup page failed", err);
      createNotification({
        text: "Redirect to MFA (authenticator app) setup page failed",
        type: "error"
      });
    }
    return null;
  };

  const handleEnableMfaAuthApp = async () => {
    try {
      if (!user.mfaMethods?.includes(MfaMethod.AUTH_APP)) {
        redirectToMfaSetupPage(); // TODO: improve this to just display the QR code & TOTP input on a page rather than go through the modal again
      };
    } catch (err) {
      console.error("Failed to enable MFA with the authenticator app", err);
      createNotification({
        text: "Failed to enable MFA with authenticator app",
        type: "error"
      });
    };
  };

  const handleDisableMfaAuthApp = async () => {
    try {
      if (user.mfaMethods?.includes(MfaMethod.AUTH_APP)) {
        await disableMfaAuthApp();
        createNotification({
          text: "Successfully disabled MFA with authenticator app",
          type: "success"
        });
      };
    } catch (err) {
      console.error("Failed to disable MFA with the authenticator app", err);
      createNotification({
        text: "Failed to disable MFA with authenticator app",
        type: "error"
      });
    }
  };

  const handleEnableMfaEmail = async () => {
    try {
      if (!user.mfaMethods?.includes(MfaMethod.EMAIL) && serverDetails?.emailConfigured) {
        await enableMfaEmail();
        createNotification({
          text: "Successfully enabled MFA with email",
          type: "success"
        });
      } else if(!user.mfaMethods?.includes(MfaMethod.EMAIL) && !serverDetails?.emailConfigured) {
        // handle case where the user has not configured their email
        handlePopUpOpen("setUpEmail");
      };
    } catch (err) {
      console.error("Failed to enable MFA with email", err);
      createNotification({
        text: "Failed to enable MFA with email",
        type: "error"
      });
    }
  };

  const handleDisableMfaEmail = async () => {
    try {
      if (user.mfaMethods?.includes(MfaMethod.EMAIL)) {
        await disableMfaEmail();
        createNotification({
          text: "Successfully disabled MFA with email",
          type: "success"
        });
      };
    } catch (err) {
      console.error("Failed to disable MFA with email", err);
      createNotification({
        text: "Failed to disable MFA with email",
        type: "error"
      });
    }
  };

return (
  <form>
    {user && (
      <div className="p-4 mb-6 bg-mineshaft-900 max-w-6xl rounded-lg border border-mineshaft-600">
       <div className="flex items-center flex-grow">
        <p className="text-xl font-semibold text-mineshaft-100 mb-8">
          Multi-factor authentication
        </p>
        <div className="flex items-center mb-4 ml-auto">
          {user.isMfaEnabled && (
            <Button
              onClick={handleDisableMfaAll}
              className="bg-red-500 border-red-500 text-white"
              leftIcon={<FontAwesomeIcon icon={faBan} />}
            >
              Disable All
            </Button>
          )}
        </div>
      </div>
        <p className="text-gray-400 mb-4">
          Multi-factor authentication adds an additional layer of security to your account by requiring more than just a password to sign in.
        </p>
          {user.isMfaEnabled && user.mfaMethods ? (
            <>
              <section className="border rounded-lg p-4 mb-4 flex flex-wrap justify-center items-center text-center">
                <article className="mb-4 flex flex-col items-center flex-grow p-4 mb-4">
                  <div className="mb-4">
                    <p className="text-xl font-semibold text-mineshaft-100 mb-2">Preferred MFA method</p>
                  </div>
                  <select
                    className="border p-2 rounded-md"
                    value={selectedMfaPreference}
                    onChange={handlePreferenceChange}
                  >
                    {user.mfaMethods.includes(MfaMethod.EMAIL) && (
                      <option value={MfaMethod.EMAIL}>Email</option>
                    )}
                    {user.mfaMethods.includes(MfaMethod.AUTH_APP) && (
                      <option value={MfaMethod.AUTH_APP}>Authenticator app</option>
                    )}
                  </select>
                </article>
                <article className="flex flex-col items-center flex-grow p-4 mb-4">
                  <div>
                    <p className="text-xl font-semibold text-mineshaft-100 mb-2">Learn more about MFA</p>
                  </div>
                  <RedirectButton 
                    text="Go to Infisical docs"
                    redirectText="Redirecting to Infisical docs..."
                    url="https://infisical.com/docs/documentation/platform/mfa" 
                    leftIcon={<FontAwesomeIcon icon={faBook} />}
                  />
                </article>
              </section>
              <section className="border rounded-lg p-4 mb-4">
                <div>
                  <p className="text-xl font-semibold text-mineshaft-100 mb-8">
                  Multi-factor methods
                  </p>
                </div>
                {/* Email */}
                <article className="border rounded-lg p-4 mb-4">
                  <div className="flex items-center mb-4">
                    <div className="mr-4">
                      <FontAwesomeIcon icon={faAt} />
                    </div>
                    <div className="flex items-center flex-grow">
                      <p className="mr-2">Email</p>
                      <div
                        className={`border ${
                          user.mfaMethods.includes(MfaMethod.EMAIL)
                            ? "border-green-500 text-green-500"
                            : "border-red-500 text-red-500"
                        } p-2 rounded-md mb-2`}
                      >
                        {user.mfaMethods.includes(MfaMethod.EMAIL) ? "Configured" : "Not Configured"}
                      </div>
                    </div>
                    <div>
                      {user.mfaMethods.includes(MfaMethod.EMAIL) && (
                      <Button
                        onClick={handleDisableMfaEmail}
                        leftIcon={<FontAwesomeIcon icon={faBan} />}
                        className='bg-red-500 border-red-500 text-white'
                      >
                        Disable
                      </Button>
                      )}
                      {!user.mfaMethods.includes(MfaMethod.EMAIL) && (
                      <Button
                        onClick={handleEnableMfaEmail}
                        leftIcon={<FontAwesomeIcon icon={faRocket} />}
                        className='bg-green-500 border-green-500 text-white'
                      >
                        Enable
                      </Button>
                      )}
                      <EmailServiceSetupModal
                        isOpen={popUp.setUpEmail?.isOpen}
                        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
                      />
                    </div>
                  </div>
                  <div>
                    <p>
                      Use your email to add an extra layer of security to your account.
                    </p>
                  </div>
                </article>
                {/* Authenticator app */}
                <article className="border rounded-lg p-4 mb-4">
                  <div className="flex items-center mb-4">
                    <div className="mr-4">
                      <FontAwesomeIcon icon={faQrcode} />
                    </div>
                    <div className="flex items-center flex-grow">
                      <p className="mr-2">Authenticator app</p>
                      <div
                        className={`border ${
                          user.mfaMethods?.includes(MfaMethod.AUTH_APP)
                            ? "border-green-500 text-green-500"
                            : "border-red-500 text-red-500"
                        } p-2 rounded-md mb-2`}
                      >
                        {user.mfaMethods.includes(MfaMethod.AUTH_APP) ? "Configured" : "Not Configured"}
                      </div>
                    </div>
                    <div>
                      {user.mfaMethods.includes(MfaMethod.AUTH_APP) && (
                      <Button
                        onClick={handleDisableMfaAuthApp}
                        leftIcon={<FontAwesomeIcon icon={faBan} />}
                        className='bg-red-500 border-red-500 text-white'
                      >
                        Disable
                      </Button>
                      )}
                      {!user.mfaMethods.includes(MfaMethod.AUTH_APP) && (
                      <Button
                        onClick={handleEnableMfaAuthApp}
                        leftIcon={<FontAwesomeIcon icon={faRocket} />}
                        className='bg-green-500 border-green-500 text-white'
                      >
                        Enable
                      </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <p>
                      Use an authentication app or browser extension to get two-factor authentication codes when prompted.
                    </p>
                  </div>
                </article>
              </section>
              {/* MFA recovery codes - NOT displayed if only MFA with email is configured */}
              { user.mfaMethods.includes(MfaMethod.AUTH_APP) && (
              <section className="border rounded-lg p-4 mb-4">
                <p className="text-xl font-semibold text-mineshaft-100 mb-8">MFA recovery options</p>
                <article className="border rounded-lg p-4 mb-4">
                  <div className="flex items-center mb-4">
                    <div className="mr-4">
                      <FontAwesomeIcon icon={faScroll} />
                    </div>
                    <div className="flex items-center flex-grow">
                      <p className="mr-2">MFA recovery codes</p>
                      <div
                        className={`border ${
                          user.mfaMethods.includes(MfaMethod.MFA_RECOVERY_CODES)
                            ? "border-green-500 text-green-500"
                            : "border-red-500 text-red-500"
                        } p-2 rounded-md mb-2`}
                      >
                      {user.mfaMethods.includes(MfaMethod.MFA_RECOVERY_CODES) ? "Viewed" : "Not Viewed"}
                      </div>
                      {mfaRecoveryCodesLeft > 0 && (
                        <div className="border border-green-500 text-green-500 p-2 rounded-md mb-2 ml-2">
                        {mfaRecoveryCodesLeft > 1 ? `${mfaRecoveryCodesLeft} codes left` : "1 code left"}
                        </div>
                        )
                      }
                    </div>
                    <div>
                      {showViewMfaRecoveryCodesButton ? (
                        <Button
                          onClick={() => {
                            setShowViewMfaRecoveryCodesButton(false);
                            setShowMfaRecoveryCodesModal(true);
                          }}
                          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                          className='bg-green-500 border-green-500 text-white'
                        >
                          View
                        </Button>
                        ) : (
                        <Button
                          onClick={() => {
                            setShowMfaRecoveryCodesModal(false);
                            setShowViewMfaRecoveryCodesButton(true);
                          }}
                          leftIcon={<FontAwesomeIcon icon={faGhost} />}
                          className='bg-green-500 border-green-500 text-white'
                        >
                          Hide
                        </Button>
                        )
                      }
                    </div>
                  </div>
                  <div>
                    <p>
                      MFA recovery codes can be used to access your account in the event you lose access to your authenticator device and cannot receive two-factor authentication codes. Once a code is used, it cannot be reused.                    
                    </p>
                  </div>
                  {showMfaRecoveryCodesModal && (
                    <MfaRecoveryCodesModal />
                  )}      
                </article>
              </section>
              )}
            </>
            ) : (
              <section className="border rounded-lg p-4 mb-4">
                  <div className="flex items-center flex-grow">
                  <RedirectButton 
                    text="Enable MFA for your account"
                    redirectText="Redirecting to MFA setup page..."
                    path="/mfa-setup" 
                    leftIcon={<FontAwesomeIcon icon={faLock} />}
                  />
                  </div>
                </section>
            )
          }
        </div>
    )}
    {userLoading && 
      <>Loading user...</>
    }
    </form>
  );
};
