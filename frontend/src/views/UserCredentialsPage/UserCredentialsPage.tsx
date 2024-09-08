import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { TUserCredential } from "@app/hooks/api/userCredentials/types";
import { usePopUp, UsePopUpReturn } from "@app/hooks/usePopUp";

import { CreateCredentialModal, CredentialsPopup } from "./components/AddCredentialsModal";
import CredentialTabs from "./components/UserCredentialsTable";

type CredentialsViewProps = {
  handlePopUpOpen: UsePopUpReturn<CredentialsPopup>["handlePopUpOpen"];
  setCredentialToEdit: (credential?: TUserCredential) => void
}

function CredentialsView(
  { handlePopUpOpen, setCredentialToEdit }: CredentialsViewProps
) {
  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4 w-full" >
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Credentials</p>
        <div className="flex w-full justify-end pr-4" />
        <Button
          colorSchema="primary"
          type="submit"
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          onClick={() => {
            setCredentialToEdit(undefined);
            handlePopUpOpen("credential");
          }
          }
          isDisabled={false}
        >
          Add Credential
        </Button>
      </div>
      <CredentialTabs
        onEditTriggered={
          credential => {
            setCredentialToEdit(credential);
            handlePopUpOpen("credential");
          }
        } />
    </div>
  );
}

export function UserCredentialsPage() {
  const { popUp,
    handlePopUpOpen,
    // handlePopUpClose, 
    handlePopUpToggle
  } = usePopUp<CredentialsPopup>(["credential"]);

  const [credentialToEdit, setCredentialToEdit] = useState<TUserCredential | undefined>();

  return (
    <div>
      <div className="full w-full bg-bunker-800 text-white">
        <div className="w-full max-w-7xl">
          <div className="mb-6 text-lg text-mineshaft-300">
            Store and manage credentials like API keys, passwords, and credit card data.
          </div>
        </div>

        <CredentialsView
          handlePopUpOpen={handlePopUpOpen}
          setCredentialToEdit={setCredentialToEdit}
        />

        <CreateCredentialModal
          popUp={popUp}
          handlePopUpToggle={handlePopUpToggle}
          credentialToEdit={credentialToEdit}
        />
      </div>
    </div>
  );
}
