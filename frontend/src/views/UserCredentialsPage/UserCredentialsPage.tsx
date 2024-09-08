import { useEffect, useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { useGetCredentials } from "@app/hooks/api/userCredentials/queries";
import { TUserCredential } from "@app/hooks/api/userCredentials/types";
import { usePopUp, UsePopUpReturn } from "@app/hooks/usePopUp";

import { CredentialModal, CredentialsPopup } from "./components/AddCredentialsModal";
import CredentialTabs from "./components/UserCredentialsTable";

type CredentialsViewProps = {
  isLoading: boolean; // is the credentials list loading?
  handlePopUpOpen: UsePopUpReturn<CredentialsPopup>["handlePopUpOpen"];
  setCredentialToEdit: (credential?: TUserCredential) => void // triggered when user edits a credential
  onCredentialDeleted: (deleted: TUserCredential) => void
  allCredentials: TUserCredential[] // Credentials fetched from the API
}

function CredentialsView(
  {
    isLoading,
    allCredentials,
    handlePopUpOpen,
    setCredentialToEdit,
    onCredentialDeleted
  }: CredentialsViewProps
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
          }}
          isDisabled={false}
        >
          Add Credential
        </Button>
      </div>

      <CredentialTabs
        isLoading={isLoading}
        allCredentials={allCredentials}
        onEditTriggered={
          credential => {
            setCredentialToEdit(credential);
            handlePopUpOpen("credential");
          }
        }
        onCredentialDeleted={onCredentialDeleted}
      />
    </div>
  );
}

export function UserCredentialsPage() {
  const { popUp,
    handlePopUpOpen,
    handlePopUpToggle
  } = usePopUp<CredentialsPopup>(["credential"]);

  const [credentialToEdit, setCredentialToEdit] = useState<TUserCredential | undefined>();
  const { isLoading, data } = useGetCredentials();
  const [allCredentials, setAllCredentials] = useState<TUserCredential[]>([]);

  // TODO: This useEffect (and the prop drilling that follows by passing around a local copy of "Credentials")
  // can be avoided by invalidating some query keys when the user modifies a credentials.
  useEffect(() => {
    if (!isLoading && data) {
      setAllCredentials([...data.credentials]);
    }
  }, [isLoading]);

  const onCredentialAdded = (credential: TUserCredential) => {
    const isExisting = allCredentials.some(c => c.credentialId === credential.credentialId);
    if (isExisting) {
      setAllCredentials(allCredentials.map(c => c.credentialId === credential.credentialId ? credential : c));
    } else {
      setAllCredentials(old => [...old, credential]);
    }
  }

  const onCredentialDeleted = (deleted: TUserCredential) => {
    setAllCredentials(allCredentials.filter(credential =>
      (deleted.credentialId !== credential.credentialId)
      && typeof credential.credentialId !== "undefined"
    ));
  }

  return (
    <div>
      <div className="full w-full bg-bunker-800 text-white">
        <div className="w-full max-w-7xl">
          <div className="mb-6 text-lg text-mineshaft-300">
            <p>
              Store and manage credentials like API keys and log-in information.
            </p>
            Click on passwords to copy them.
          </div>
        </div>

        <CredentialsView
          isLoading={isLoading}
          handlePopUpOpen={handlePopUpOpen}
          allCredentials={allCredentials}
          setCredentialToEdit={setCredentialToEdit}
          onCredentialDeleted={onCredentialDeleted}
        />

        <CredentialModal
          popUp={popUp}
          handlePopUpToggle={handlePopUpToggle}
          credentialToEdit={credentialToEdit}
          onEditDone={() => setCredentialToEdit(undefined)}
          onCredentialAdded={onCredentialAdded}
        />
      </div>
    </div>
  );
}
