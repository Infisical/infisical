
import Head from "next/head";
import { faPlus, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal, Input, Select, SelectItem, Tooltip } from "@app/components/v2";
import { useDebounce, usePopUp } from "@app/hooks";
import { UserSecretsTable } from "@app/views/UserSecretPage/components/UserSecretTable";
import { AddUserSecretModal } from "@app/views/UserSecretPage/components/AddUserSecretModal";
import { useDeleteUserSecret } from "@app/hooks/api/userSecret";
import { ViewSecretModal } from "@app/views/UserSecretPage/components/ViewSecretModal";
import { CredentialType } from "@app/hooks/api/userSecret/types";

type DeleteModalData = { name: string; id: string };

const UserSecrets = () => {
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "createUserSecret",
    "deleteUserSecretConfirmation",
    "viewSecret",
    "editSecret"
  ] as const);

  const deleteUserSecret = useDeleteUserSecret();

  const onDeleteApproved = async () => {
    try {
      await deleteUserSecret.mutateAsync({ secretId: popUp.deleteUserSecretConfirmation.data.id });
      
      createNotification({
        text: "Successfully deleted user secret",
        type: "success"
      });
      handlePopUpClose("deleteUserSecretConfirmation");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete user secret",
        type: "error"
      });
    }
  };

  const [selectedCredentialType, setSelectedCredentialType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);


  const getDisplayTitle = (type: string) => {
    switch (type) {
      case CredentialType.WEB_LOGIN:
        return "Web Login Secrets";
      case CredentialType.CREDIT_CARD:
        return "Credit Card Secrets";
      case CredentialType.SECURE_NOTE:
        return "Secure Note Secrets";
      default:
        return "All User Secrets";
    }
  };

  return (
    <div className="container mx-auto h-full w-full max-w-7xl bg-bunker-800 px-6 text-white">
      <Head>
        <title>User Secrets</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>
      <div className="mt-8">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-gray-200">User Secrets</h1>
          <p className="text-bunker-300">
            Manage and control user-specific secrets
          </p>
        </div>
        <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="text-base font-medium text-gray-100">
                {getDisplayTitle(selectedCredentialType)}
              </div>
              
            </div>
            <div className="flex items-center gap-4">
            <Tooltip content="Search by name or description">
            <Input
            placeholder="Search by name or description..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faSearch} />}
                className="w-64"
              />
            </Tooltip>
            <Tooltip content="Filter by type">
            <Select 
                value={selectedCredentialType}
                onValueChange={setSelectedCredentialType}
                position="popper"
                className="w-48"
              >
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value={CredentialType.WEB_LOGIN}>Web Login</SelectItem>
                <SelectItem value={CredentialType.CREDIT_CARD}>Credit Card</SelectItem>
                <SelectItem value={CredentialType.SECURE_NOTE}>Secure Note</SelectItem>
              </Select>
            </Tooltip>
            <Tooltip content="Add a new user secret">
            <Button
              colorSchema="primary"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("createUserSecret")}
            >
              Add User Secret
            </Button>
            </Tooltip>
            </div>
          </div>
          <div className="min-h-[200px]">
            <UserSecretsTable 
              handlePopUpOpen={handlePopUpOpen} 
              credentialTypeFilter={selectedCredentialType}
              searchQuery={debouncedSearchQuery}
            />
          </div>
        </div>
      </div>
      <AddUserSecretModal
        mode="create"
        isOpen={popUp.createUserSecret.isOpen}
        handlePopUpToggle={() => handlePopUpClose("createUserSecret")}
      />
      <AddUserSecretModal
        mode="edit"
        isOpen={popUp.editSecret.isOpen}
        handlePopUpToggle={() => handlePopUpClose("editSecret")}
        initialData={popUp?.editSecret.data}
        secretId={popUp?.editSecret.data?.id}
      />
      <DeleteActionModal
        isOpen={popUp.deleteUserSecretConfirmation.isOpen}
        title={`Delete ${
          (popUp?.deleteUserSecretConfirmation?.data as DeleteModalData)?.name || " "
        } user secret?`}
        onChange={(isOpen) => handlePopUpToggle("deleteUserSecretConfirmation", isOpen)}
        deleteKey={(popUp?.deleteUserSecretConfirmation?.data as DeleteModalData)?.name}
        onClose={() => handlePopUpClose("deleteUserSecretConfirmation")}
        onDeleteApproved={onDeleteApproved}
      />
      <ViewSecretModal
        isOpen={popUp.viewSecret.isOpen}
        data={popUp.viewSecret.data}
        onClose={() => handlePopUpClose("viewSecret")}
      />
    </div>
  );
};

Object.assign(UserSecrets, { requireAuth: true });

export default UserSecrets;
