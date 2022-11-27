import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";

import addIncidentContact from "~/pages/api/organization/addIncidentContact";

import Button from "../buttons/Button";
import InputField from "../InputField";

const AddIncidentContactDialog = ({
  isOpen,
  closeModal,
  workspaceId,
  incidentContacts,
  setIncidentContacts,
}) => {
  let [incidentContactEmail, setIncidentContactEmail] = useState("");

  const submit = () => {
    setIncidentContacts(
      incidentContacts?.length > 0
        ? incidentContacts.concat([incidentContactEmail])
        : [incidentContactEmail]
    );
    addIncidentContact(
      localStorage.getItem("orgData.id"),
      incidentContactEmail
    );
    closeModal();
  };
  return (
    <div>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={closeModal}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-70" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-md bg-bunker-800 border border-gray-700 p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-400"
                  >
                    Add an Incident Contact
                  </Dialog.Title>
                  <div className="mt-2 mb-2">
                    <p className="text-sm text-gray-500">
                      This contact will be notified in the unlikely event of a
                      severe incident.
                    </p>
                  </div>
                  <div className="max-h-28">
                    <InputField
                      label="Email"
                      onChangeHandler={setIncidentContactEmail}
                      type="varName"
                      value={incidentContactEmail}
                      placeholder=""
                      isRequired
                    />
                  </div>
                  <div className="mt-6 max-w-max">
                    <Button
                      onButtonPressed={submit}
                      color="mineshaft"
                      text="Add Incident Contact"
                      size="md"
                    />
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

export default AddIncidentContactDialog;
