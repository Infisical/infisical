import Head from "next/head";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { usePopUp } from "@app/hooks";

import { AddUserSecretsModal } from "./AddUserSecretsModal";
import { EditUserSecretsModal } from "./EditUserSecretsModal";
import { UserSecretsTable } from "./UserSecretsTable";
import { apiRequest } from "@app/config/request";
import { TUserSecrets, useGetAllSecrets } from "@app/hooks/api/userSecrets";
import { useEffect, useState } from "react";

type DeleteModalData = { name: string; id: string };

export const AddUserSecretsSection = () => {
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "createSharedSecret",
    "deleteUserSecretConfirmation",
    "editCredentials"
  ] as const);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [data, setData] = useState<{ secrets: TUserSecrets[]; totalCount: number }>();
  const [isLoading, setIsLoading] = useState(false);

  const getData = async () => {

    const params = new URLSearchParams({
      offset: String((page - 1) * perPage),
      limit: String(perPage)
    });

    const { data } = await apiRequest.get<{ secrets: TUserSecrets[]; totalCount: number }>(
      "/api/v1/user-secrets/",
      {
        params
      }
    );


    setData(data);
    setIsLoading(isLoading)
  }

  useEffect(() => {
    getData();
  }, [])

  const onDeleteApproved = async (): Promise<void> => {
    try {
      const secretId = (popUp?.deleteUserSecretConfirmation?.data as DeleteModalData)?.id
      const { data } = await apiRequest.delete<TUserSecrets>(
        `/api/v1/user-secrets/${secretId}`
      );

      createNotification({
        text: "Successfully deleted shared secret",
        type: "success"
      });
      handlePopUpClose("deleteUserSecretConfirmation");
      getData();
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete shared secret",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <Head>
        <title>Add Credentials</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Add Credentials</p>
        <Button
          colorSchema="primary"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() => {
            handlePopUpOpen("createSharedSecret");
          }}
        >
          Add Credentials
        </Button>
      </div>
      <UserSecretsTable handlePopUpOpen={handlePopUpOpen} data={data!} isLoading={isLoading} />
      <AddUserSecretsModal popUp={popUp} handlePopUpToggle={(...rest) => { handlePopUpToggle(...rest); getData() }} />
      <EditUserSecretsModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteUserSecretConfirmation.isOpen}
        title={`Delete ${(popUp?.deleteUserSecretConfirmation?.data as DeleteModalData)?.name || " "
          } shared secret?`}
        onChange={(isOpen) => handlePopUpToggle("deleteUserSecretConfirmation", isOpen)}
        deleteKey={(popUp?.deleteUserSecretConfirmation?.data as DeleteModalData)?.name}
        onClose={() => handlePopUpClose("deleteUserSecretConfirmation")}
        onDeleteApproved={onDeleteApproved}
      />
    </div>
  );
};
