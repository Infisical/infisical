import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { useGetUserSecrets } from "@app/hooks/api/userSecrets";

import SecretsTable from "./SecretsTable";

const WebLoginTab = () => {
  const {isLoading, isError, data} = useGetUserSecrets()
  const columns = ["Username", "Password", "URL", "Created At"];
  if (isError && !isLoading) {
    return <div>Error...</div>
  }
  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Web Login</p>
        <Button
          colorSchema="primary"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          // onClick={() => {
          //   handlePopUpOpen("createSharedSecret");
          // }}
        >
          Share Secret
        </Button>
      </div>
      <SecretsTable columns={columns} isLoading={false} secrets={data?.secrets.map((s) => s.fields) ?? []}  />
      {/* <AddShareSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} /> */}
      {/* <DeleteActionModal
        isOpen={popUp.deleteSharedSecretConfirmation.isOpen}
        title={`Delete ${
          (popUp?.deleteSharedSecretConfirmation?.data as DeleteModalData)?.name || " "
        } shared secret?`}
        onChange={(isOpen) => handlePopUpToggle("deleteSharedSecretConfirmation", isOpen)}
        deleteKey={(popUp?.deleteSharedSecretConfirmation?.data as DeleteModalData)?.name}
        onClose={() => handlePopUpClose("deleteSharedSecretConfirmation")}
        onDeleteApproved={onDeleteApproved}
      /> */}
    </div>
  );
};

export default WebLoginTab;
