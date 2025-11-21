import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";

import { RecoveryCodesDownload } from "@app/components/mfa/RecoveryCodesDownload";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  ContentLoader,
  DeleteActionModal,
  EmailServiceSetupModal,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { useGetUser, userKeys, useUpdateUserMfa } from "@app/hooks/api";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import {
  useCreateNewTotpRecoveryCodes,
  useDeleteUserTotpConfiguration,
  useVerifyUserTotpRegistration
} from "@app/hooks/api/users/mutation";
import {
  useGetUserTotpConfiguration,
  useGetUserTotpRegistration
} from "@app/hooks/api/users/queries";
import { AuthMethod } from "@app/hooks/api/users/types";
import {
  useDeleteWebAuthnCredential,
  useGenerateRegistrationOptions,
  useGetWebAuthnCredentials,
  useUpdateWebAuthnCredential,
  useVerifyRegistration
} from "@app/hooks/api/webauthn";
import { usePopUp } from "@app/hooks/usePopUp";

export const MFASection = () => {
  const { data: user } = useGetUser();
  const { mutateAsync } = useUpdateUserMfa();

  const [formData, setFormData] = useState({
    isMfaEnabled: user?.isMfaEnabled || false,
    selectedMfaMethod: user?.selectedMfaMethod || MfaMethod.EMAIL
  });
  const [isLoading, setIsLoading] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [showMobileAuthSetup, setShowMobileAuthSetup] = useState(false);

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "setUpEmail",
    "deleteTotpConfig",
    "downloadRecoveryCodes",
    "deleteWebAuthnCredential",
    "renameWebAuthnCredential",
    "registerPasskey"
  ] as const);
  const [shouldShowRecoveryCodes, setShouldShowRecoveryCodes] = useToggle();
  const { data: totpConfiguration } = useGetUserTotpConfiguration();
  const { data: totpRegistration, isPending: isTotpRegistrationLoading } =
    useGetUserTotpRegistration({
      enabled: showMobileAuthSetup
    });
  const { mutateAsync: deleteTotpConfiguration } = useDeleteUserTotpConfiguration();
  const { mutateAsync: createTotpRecoveryCodes } = useCreateNewTotpRecoveryCodes();
  const { mutateAsync: verifyUserTotp } = useVerifyUserTotpRegistration();
  const queryClient = useQueryClient();
  const { data: serverDetails } = useFetchServerStatus();

  // WebAuthn/Passkey hooks
  const { data: webAuthnCredentials, isPending: isWebAuthnCredentialsLoading } =
    useGetWebAuthnCredentials();
  const { mutateAsync: generateRegistrationOptions, isPending: isGeneratingOptions } =
    useGenerateRegistrationOptions();
  const { mutateAsync: verifyRegistration, isPending: isVerifyingRegistration } =
    useVerifyRegistration();
  const { mutateAsync: deleteWebAuthnCredential } = useDeleteWebAuthnCredential();
  const { mutateAsync: updateWebAuthnCredential } = useUpdateWebAuthnCredential();

  const [selectedCredentialId, setSelectedCredentialId] = useState<string>("");
  const [credentialName, setCredentialName] = useState<string>("");
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);

  // Update form data when user data changes
  useEffect(() => {
    if (user) {
      setFormData({
        isMfaEnabled: user.isMfaEnabled,
        selectedMfaMethod: user.selectedMfaMethod || MfaMethod.EMAIL
      });
    }
  }, [user]);

  useEffect(() => {
    const generateQRCode = async () => {
      if (totpRegistration?.otpUrl) {
        const url = await QRCode.toDataURL(totpRegistration.otpUrl);
        setQrCodeUrl(url);
      }
    };

    if (showMobileAuthSetup && totpRegistration?.otpUrl) {
      generateQRCode();
    }
  }, [totpRegistration, showMobileAuthSetup]);

  const handleTotpDeletion = async () => {
    await deleteTotpConfiguration();

    await mutateAsync({
      selectedMfaMethod: MfaMethod.EMAIL
    });

    createNotification({
      text: "Successfully deleted mobile authenticator and switched to email authentication",
      type: "success"
    });

    handlePopUpClose("deleteTotpConfig");
  };

  const handleGenerateMoreRecoveryCodes = async () => {
    await createTotpRecoveryCodes();

    createNotification({
      text: "Successfully generated new recovery codes",
      type: "success"
    });
  };

  const handleRegisterPasskey = async () => {
    try {
      setIsRegisteringPasskey(true);

      // Check if WebAuthn is supported
      if (
        !window.PublicKeyCredential ||
        !window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
      ) {
        createNotification({
          text: "WebAuthn is not supported on this browser",
          type: "error"
        });
        return;
      }

      // Check if platform authenticator is available
      const available =
        await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) {
        createNotification({
          text: "No passkey-compatible authenticator found on this device",
          type: "error"
        });
        return;
      }

      // Generate registration options from server
      const options = await generateRegistrationOptions();
      const registrationResponse = await startRegistration({ optionsJSON: options });

      // Verify registration with server
      await verifyRegistration({
        registrationResponse,
        name: credentialName || "Passkey"
      });

      createNotification({
        text: "Successfully registered passkey",
        type: "success"
      });

      handlePopUpClose("registerPasskey");
      setCredentialName("");
    } catch (error: any) {
      console.error("Failed to register passkey:", error);

      // Better error messages
      let errorMessage = "Failed to register passkey";
      if (error.name === "NotAllowedError") {
        errorMessage = "Passkey registration was cancelled or timed out";
      } else if (error.name === "InvalidStateError") {
        errorMessage = "This passkey has already been registered";
      } else if (error.message) {
        errorMessage = error.message;
      }

      createNotification({
        text: errorMessage,
        type: "error"
      });
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const handleDeleteWebAuthnCredential = async () => {
    try {
      await deleteWebAuthnCredential({ id: selectedCredentialId });

      createNotification({
        text: "Successfully deleted passkey",
        type: "success"
      });

      handlePopUpClose("deleteWebAuthnCredential");
      setSelectedCredentialId("");
    } catch (error: any) {
      createNotification({
        text: error.message || "Failed to delete passkey",
        type: "error"
      });
    }
  };

  const handleRenameWebAuthnCredential = async () => {
    try {
      await updateWebAuthnCredential({
        id: selectedCredentialId,
        name: credentialName
      });

      createNotification({
        text: "Successfully renamed passkey",
        type: "success"
      });

      handlePopUpClose("renameWebAuthnCredential");
      setSelectedCredentialId("");
      setCredentialName("");
    } catch (error: any) {
      createNotification({
        text: error.message || "Failed to rename passkey",
        type: "error"
      });
    }
  };

  const handleFormDataChange = async (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));

    // Show mobile auth setup when mobile authenticator is selected and we're enabling 2FA
    if (field === "selectedMfaMethod" && value === MfaMethod.TOTP && formData.isMfaEnabled) {
      setShowMobileAuthSetup(true);
    } else if (field === "selectedMfaMethod" && value !== MfaMethod.TOTP) {
      setShowMobileAuthSetup(false);
      setTotpCode("");
      setShouldShowRecoveryCodes.off();
      if (totpConfiguration?.isVerified) {
        await deleteTotpConfiguration().catch(console.error);
      }
    } else if (field === "isMfaEnabled" && value && formData.selectedMfaMethod === MfaMethod.TOTP) {
      setShowMobileAuthSetup(true);
    } else if (field === "isMfaEnabled" && !value) {
      setShowMobileAuthSetup(false);
      setTotpCode("");
      setShouldShowRecoveryCodes.off();
    }
  };

  const handleSaveChanges = async () => {
    try {
      if (!user) return;

      if (user.authMethods.includes(AuthMethod.LDAP)) {
        createNotification({
          text: "Two-factor authentication is not available for LDAP users.",
          type: "error"
        });
        return;
      }

      if (!serverDetails?.emailConfigured && formData.isMfaEnabled) {
        handlePopUpOpen("setUpEmail");
        return;
      }

      // If selecting passkey as 2FA method but no passkeys registered
      if (
        formData.isMfaEnabled &&
        formData.selectedMfaMethod === MfaMethod.WEBAUTHN &&
        (!webAuthnCredentials || webAuthnCredentials.length === 0)
      ) {
        createNotification({
          text: "Please register at least one passkey before selecting it as your two-factor authentication method",
          type: "error"
        });
        return;
      }

      setIsLoading(true);

      // If enabling 2FA with mobile authenticator, verify TOTP first
      if (
        formData.isMfaEnabled &&
        formData.selectedMfaMethod === MfaMethod.TOTP &&
        !totpConfiguration?.isVerified
      ) {
        if (!totpCode.trim()) {
          createNotification({
            text: "Please enter the verification code from your authenticator app",
            type: "error"
          });
          setIsLoading(false);
          return;
        }

        try {
          await verifyUserTotp({ totp: totpCode });

          handlePopUpOpen("downloadRecoveryCodes");

          createNotification({
            text: "Successfully configured mobile authenticator. Please save your recovery codes!",
            type: "success"
          });

          await queryClient.invalidateQueries({ queryKey: userKeys.totpConfiguration });
        } catch {
          setIsLoading(false);
          return;
        }
      }

      // If disabling 2FA and there's a TOTP configuration, delete it
      if (!formData.isMfaEnabled && user.isMfaEnabled && totpConfiguration?.isVerified) {
        try {
          await deleteTotpConfiguration();
          createNotification({
            text: "Mobile authenticator removed",
            type: "success"
          });

          // Refresh TOTP configuration
          await queryClient.invalidateQueries({ queryKey: userKeys.totpConfiguration });
        } catch {
          // Continue with disabling 2FA even if TOTP deletion fails
        }
      }

      const updates: any = {};

      // Only update if values have changed
      if (formData.isMfaEnabled !== user.isMfaEnabled) {
        updates.isMfaEnabled = formData.isMfaEnabled;
      }

      if (formData.selectedMfaMethod !== user.selectedMfaMethod) {
        updates.selectedMfaMethod = formData.selectedMfaMethod;
      }

      if (Object.keys(updates).length > 0) {
        await mutateAsync(updates);

        createNotification({
          text: "Successfully updated two-factor authentication settings",
          type: "success"
        });
      }

      // Reset form state
      setShowMobileAuthSetup(false);
      setTotpCode("");
      setShouldShowRecoveryCodes.off();
    } finally {
      setIsLoading(false);
    }
  };

  const hasChanges =
    user &&
    (formData.isMfaEnabled !== user.isMfaEnabled ||
      formData.selectedMfaMethod !== user.selectedMfaMethod);

  const isFormValid = () => {
    if (!formData.isMfaEnabled) return true;
    if (formData.selectedMfaMethod === MfaMethod.EMAIL) return true;
    if (formData.selectedMfaMethod === MfaMethod.TOTP) {
      if (totpConfiguration?.isVerified) return true;
      return totpCode.trim().length > 0;
    }
    if (formData.selectedMfaMethod === MfaMethod.WEBAUTHN) return true;

    return false;
  };

  const registerPasskeyModal = (
    <Modal
      isOpen={popUp.registerPasskey?.isOpen || false}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          handlePopUpClose("registerPasskey");
          setCredentialName("");
        }
      }}
    >
      <ModalContent title="Register New Passkey">
        <div className="space-y-4">
          <p className="text-sm text-mineshaft-300">
            Give your passkey a name to help you identify it later. After clicking
            &quot;Register&quot;, you&apos;ll be prompted to use your device&apos;s biometric
            authentication (Touch ID, Face ID, Windows Hello, etc.).
          </p>
          <FormControl label="Passkey Name">
            <Input
              value={credentialName}
              onChange={(e) => setCredentialName(e.target.value)}
              placeholder="e.g., My MacBook Pro"
            />
          </FormControl>
          <div className="flex gap-2">
            <Button
              onClick={handleRegisterPasskey}
              isLoading={isRegisteringPasskey || isVerifyingRegistration}
              disabled={!credentialName.trim()}
              colorSchema="primary"
            >
              Register
            </Button>
            <Button
              variant="outline_bg"
              onClick={() => handlePopUpClose("registerPasskey")}
              disabled={isRegisteringPasskey || isVerifyingRegistration}
            >
              Cancel
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );

  const renamePasskeyModal = (
    <Modal
      isOpen={popUp.renameWebAuthnCredential?.isOpen || false}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          handlePopUpClose("renameWebAuthnCredential");
          setCredentialName("");
          setSelectedCredentialId("");
        }
      }}
    >
      <ModalContent title="Rename Passkey">
        <div className="space-y-4">
          <FormControl label="Passkey Name">
            <Input
              value={credentialName}
              onChange={(e) => setCredentialName(e.target.value)}
              placeholder="e.g., My MacBook Pro"
            />
          </FormControl>
          <div className="flex gap-2">
            <Button
              onClick={handleRenameWebAuthnCredential}
              disabled={!credentialName.trim()}
              colorSchema="primary"
            >
              Save
            </Button>
            <Button
              variant="outline_bg"
              onClick={() => handlePopUpClose("renameWebAuthnCredential")}
            >
              Cancel
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSaveChanges();
        }}
        className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
      >
        <h2 className="mb-6 text-xl font-medium text-mineshaft-100">Two-factor Authentication</h2>

        {user && (
          <div className="space-y-4">
            <div className="max-w-sm">
              <FormControl
                label="Enable two-factor authentication"
                helperText="Protect your account with an additional verification step"
              >
                <Select
                  value={formData.isMfaEnabled ? "enabled" : "disabled"}
                  onValueChange={(value) =>
                    handleFormDataChange("isMfaEnabled", value === "enabled")
                  }
                  className="w-full"
                  position="popper"
                  dropdownContainerClassName="max-w-none"
                >
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="enabled">Enabled</SelectItem>
                </Select>
              </FormControl>
            </div>

            {formData.isMfaEnabled && (
              <div className="max-w-sm">
                <FormControl
                  label="Authentication method"
                  helperText="Choose your preferred method for two-factor authentication"
                >
                  <Select
                    value={formData.selectedMfaMethod}
                    onValueChange={(value) =>
                      handleFormDataChange("selectedMfaMethod", value as MfaMethod)
                    }
                    className="w-full"
                    position="popper"
                    dropdownContainerClassName="max-w-none"
                  >
                    <SelectItem value={MfaMethod.EMAIL}>Email</SelectItem>
                    <SelectItem value={MfaMethod.TOTP}>Mobile Authenticator</SelectItem>
                    <SelectItem value={MfaMethod.WEBAUTHN}>Passkey (WebAuthn)</SelectItem>
                  </Select>
                </FormControl>
              </div>
            )}

            {showMobileAuthSetup && !totpConfiguration?.isVerified && (
              <div className="space-y-6">
                <h3 className="mb-6 text-lg font-medium text-mineshaft-100">
                  Setup Mobile Authenticator
                </h3>

                <div className="mb-8">
                  <h4 className="mb-2 text-sm font-medium text-mineshaft-200">
                    Step 1: Scan QR Code
                  </h4>
                  <p className="mb-4 text-sm text-mineshaft-300">
                    Download a two-factor authentication app (Google Authenticator, Authy, etc.) and
                    scan the QR code below
                  </p>

                  <div>
                    {isTotpRegistrationLoading && (
                      <div className="py-12">
                        <ContentLoader />
                      </div>
                    )}
                    {!isTotpRegistrationLoading && qrCodeUrl && (
                      <div>
                        <div className="mb-4 w-72 pl-4">
                          <div className="inline-flex items-center justify-center rounded-xl bg-white p-6 shadow-lg">
                            <img
                              src={qrCodeUrl}
                              alt="QR Code for mobile authenticator setup"
                              className="h-48 w-48"
                            />
                          </div>
                        </div>
                        {totpRegistration?.otpUrl && (
                          <div>
                            <p className="mb-2 text-xs text-mineshaft-400">
                              Can&apos;t scan? Enter this code manually:{" "}
                              <code className="rounded-sm bg-mineshaft-700 px-3 py-1 font-mono text-sm text-mineshaft-100">
                                {totpRegistration.otpUrl.split("secret=")[1]?.split("&")[0] ||
                                  "Loading..."}
                              </code>
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-medium text-mineshaft-200">
                    Step 2: Enter verification code
                  </h4>
                  <p className="mb-4 text-sm text-mineshaft-300">
                    Enter the 6-digit code from your authenticator app to complete setup
                  </p>

                  <div className="max-w-48">
                    <FormControl isRequired>
                      <Input
                        value={totpCode}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                          setTotpCode(value);
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const pastedData = e.clipboardData
                            .getData("text")
                            .replace(/\D/g, "")
                            .slice(0, 6);
                          setTotpCode(pastedData);
                        }}
                        placeholder="Enter 2FA code"
                        maxLength={6}
                      />
                    </FormControl>
                  </div>
                </div>
              </div>
            )}

            {hasChanges && (
              <div className="flex gap-2 pt-4">
                <Button
                  type="submit"
                  isLoading={isLoading}
                  disabled={!isFormValid()}
                  colorSchema="primary"
                  variant="outline_bg"
                >
                  Save Changes
                </Button>
                <Button
                  type="button"
                  variant="outline_bg"
                  onClick={() => {
                    if (user) {
                      setFormData({
                        isMfaEnabled: user.isMfaEnabled,
                        selectedMfaMethod: user.selectedMfaMethod || MfaMethod.EMAIL
                      });
                    }
                    setShowMobileAuthSetup(false);
                    setTotpCode("");
                    setShouldShowRecoveryCodes.off();
                  }}
                  disabled={isLoading}
                  className="border-mineshaft-500 text-mineshaft-300 hover:border-mineshaft-400"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </form>

      {/* Management Sections - Separate from configuration form */}
      {user && (
        <div className="mt-6 mb-6 space-y-6">
          {/* Mobile Authenticator Management - Show if configured, regardless of active method */}
          {totpConfiguration?.isVerified && (
            <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
              <h3 className="mb-4 text-lg font-medium text-mineshaft-100">
                Mobile Authenticator Management
              </h3>
              <p className="mb-4 text-sm text-mineshaft-400">
                Manage your mobile authenticator configuration and recovery codes.
              </p>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    colorSchema="secondary"
                    variant="outline_bg"
                    onClick={setShouldShowRecoveryCodes.toggle}
                  >
                    {shouldShowRecoveryCodes ? "Hide recovery codes" : "Show recovery codes"}
                  </Button>
                  <Button
                    colorSchema="secondary"
                    variant="outline_bg"
                    onClick={handleGenerateMoreRecoveryCodes}
                  >
                    Generate more codes
                  </Button>
                  <Button
                    colorSchema="danger"
                    variant="outline_bg"
                    onClick={() => handlePopUpOpen("deleteTotpConfig")}
                  >
                    Remove Authenticator
                  </Button>
                </div>

                {shouldShowRecoveryCodes && (
                  <div className="w-fit rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4 pr-8">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm">
                      {totpConfiguration.recoveryCodes.map((code, index) => (
                        <div key={code} className="flex items-center text-mineshaft-200">
                          <span className="w-8 text-right text-mineshaft-400">{index + 1}.</span>
                          <span className="pl-2">{code}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Passkey Management - Always show */}
          <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-mineshaft-100">Passkey Management</h3>
                <p className="mt-1 text-sm text-mineshaft-400">
                  Manage your passkeys. Passkeys can be used for two-factor authentication.
                </p>
              </div>
              <Button
                colorSchema="primary"
                variant="outline_bg"
                onClick={() => {
                  setCredentialName("");
                  handlePopUpOpen("registerPasskey");
                }}
                isLoading={isGeneratingOptions}
              >
                Add Passkey
              </Button>
            </div>

            {(() => {
              if (isWebAuthnCredentialsLoading) {
                return <ContentLoader />;
              }
              if (webAuthnCredentials && webAuthnCredentials.length > 0) {
                return (
                  <div className="space-y-3">
                    {webAuthnCredentials.map((credential) => (
                      <div
                        key={credential.id}
                        className="flex items-center justify-between rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-mineshaft-100">
                              {credential.name || "Unnamed Passkey"}
                            </span>
                            {credential.transports && credential.transports.length > 0 && (
                              <span className="text-xs text-mineshaft-400">
                                ({credential.transports.join(", ")})
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-mineshaft-400">
                            Added {new Date(credential.createdAt).toLocaleDateString()}
                            {credential.lastUsedAt && (
                              <>
                                {" "}
                                · Last used {new Date(credential.lastUsedAt).toLocaleDateString()}
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="xs"
                            colorSchema="secondary"
                            variant="outline_bg"
                            onClick={() => {
                              setSelectedCredentialId(credential.id);
                              setCredentialName(credential.name || "");
                              handlePopUpOpen("renameWebAuthnCredential");
                            }}
                          >
                            Rename
                          </Button>
                          <Button
                            size="xs"
                            colorSchema="danger"
                            variant="outline_bg"
                            onClick={() => {
                              setSelectedCredentialId(credential.id);
                              handlePopUpOpen("deleteWebAuthnCredential");
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }
              return (
                <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-6 text-center">
                  <p className="text-sm text-mineshaft-300">
                    No passkeys registered yet. Add a passkey to use it for two-factor
                    authentication.
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <EmailServiceSetupModal
        isOpen={popUp.setUpEmail?.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setUpEmail", isOpen)}
      />
      <DeleteActionModal
        isOpen={popUp.deleteTotpConfig.isOpen}
        title="Remove mobile authenticator?"
        subTitle="This action is irreversible. You'll have to go through the setup process to enable it again."
        onChange={(isOpen) => handlePopUpToggle("deleteTotpConfig", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleTotpDeletion}
      />

      <RecoveryCodesDownload
        isOpen={popUp.downloadRecoveryCodes?.isOpen || false}
        onClose={() => handlePopUpClose("downloadRecoveryCodes")}
        recoveryCodes={totpRegistration?.recoveryCodes || []}
        onDownloadComplete={() => handlePopUpClose("downloadRecoveryCodes")}
      />

      {registerPasskeyModal}
      {renamePasskeyModal}

      {/* Delete Passkey Modal */}
      <DeleteActionModal
        isOpen={popUp.deleteWebAuthnCredential?.isOpen || false}
        title="Remove passkey?"
        subTitle="This action is irreversible. You'll need to register this passkey again if you want to use it in the future."
        onChange={(isOpen) => handlePopUpToggle("deleteWebAuthnCredential", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleDeleteWebAuthnCredential}
      />
    </>
  );
};
