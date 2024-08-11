import React from "react";
import Head from "next/head";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { usePopUp } from "@app/hooks";
import { useDeleteUserSecret, UserSecretType } from "@app/hooks/api/userSecrets";

import { AddUserSecretModal } from "./AddUserSecretModal";
import { ShowSecretDetailModal } from "./ShowSecretDetailModal";
import { UserSecretsCreditCardsTable } from "./UserSecretsCreditCardsTable";
import { UserSecretsSecureNotesTable } from "./UserSecretsSecureNotesTable";
import { UserSecretsWebLoginTable } from "./UserSecretsWebLoginTable";

type DeleteModalData = { name: string; id: string };

export const UserSecretsSection = () => {
  const deleteuserSecret = useDeleteUserSecret();
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "addOrUpdateUserSecret",
    "deleteUserSecretConfirmation",
    "showSecretData"
  ] as const);

  const onDeleteApproved = async () => {
    try {
      deleteuserSecret.mutateAsync({
        id: (popUp?.deleteUserSecretConfirmation?.data as DeleteModalData)?.id
      });
      createNotification({
        text: "Successfully deleted the secret",
        type: "success"
      });

      handlePopUpClose("deleteUserSecretConfirmation");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete shared secret",
        type: "error"
      });
    }
  };
  return (
    <>
      <Head>
        <title>User Secrets</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>

      {/* Web Login */}
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex justify-between">
          <p className="text-xl font-semibold text-mineshaft-100">Web Logins</p>
          <Button
            colorSchema="primary"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => {
              handlePopUpOpen("addOrUpdateUserSecret", {
                isEditMode: false,
                secretValue: { secretType: UserSecretType.WEB_LOGIN }
              });
            }}
          >
            Add Secret
          </Button>
        </div>
        <UserSecretsWebLoginTable handlePopUpOpen={handlePopUpOpen} />
      </div>

      {/* Credit Cards */}
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex justify-between">
          <p className="text-xl font-semibold text-mineshaft-100">Credit Cards</p>
          <Button
            colorSchema="primary"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => {
              handlePopUpOpen("addOrUpdateUserSecret", {
                isEditMode: false,
                secretValue: { secretType: UserSecretType.CREDIT_CARD }
              });
            }}
          >
            Add Secret
          </Button>
        </div>
        <UserSecretsCreditCardsTable handlePopUpOpen={handlePopUpOpen} />
      </div>

      {/* Secure Notes */}
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex justify-between">
          <p className="text-xl font-semibold text-mineshaft-100">Secure Notes</p>
          <Button
            colorSchema="primary"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => {
              handlePopUpOpen("addOrUpdateUserSecret", {
                isEditMode: false,
                secretValue: { secretType: UserSecretType.SECURE_NOTE }
              });
            }}
          >
            Add Secret
          </Button>
        </div>
        <UserSecretsSecureNotesTable handlePopUpOpen={handlePopUpOpen} />
      </div>

      <AddUserSecretModal popUp={popUp} handlePopUpClose={handlePopUpClose} />
      <ShowSecretDetailModal popUp={popUp} handlePopUpClose={handlePopUpClose} />
      <DeleteActionModal
        isOpen={popUp.deleteUserSecretConfirmation.isOpen}
        title={`Delete ${
          (popUp?.deleteUserSecretConfirmation?.data as DeleteModalData)?.name || " "
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteUserSecretConfirmation", isOpen)}
        deleteKey={(popUp?.deleteUserSecretConfirmation?.data as DeleteModalData)?.name}
        onClose={() => handlePopUpClose("deleteUserSecretConfirmation")}
        onDeleteApproved={onDeleteApproved}
      />
    </>
  );
};
