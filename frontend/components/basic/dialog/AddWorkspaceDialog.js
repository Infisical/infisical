import { Fragment, useState } from "react";
import Image from "next/image";
import { Dialog, Transition } from "@headlessui/react";

import Button from "../buttons/Button";
import InputField from "../InputField";
import { Checkbox } from "../table/Checkbox";

/**
 * The dialog modal for when the user wants to create a new workspace
 * @param {*} param0
 * @returns
 */
const AddWorkspaceDialog = ({
  isOpen,
  closeModal,
  submitModal,
  workspaceName,
  setWorkspaceName,
  error,
  loading,
}) => {
  const [addAllUsers, setAddAllUsers] = useState(true);
  const submit = () => {
    submitModal(workspaceName, addAllUsers);
  };

  return (
    <div>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-20" onClose={closeModal}>
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

          <div className="fixed inset-0 overflow-y-auto z-50">
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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-bunker-800 border border-gray-700 p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-400"
                  >
                    Create a new project
                  </Dialog.Title>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      This project will contain your environmental variables.
                    </p>
                  </div>
                  <div className="max-h-28 mt-4">
                    <InputField
                      label="Project Name"
                      onChangeHandler={setWorkspaceName}
                      type="varName"
                      value={workspaceName}
                      placeholder=""
                      isRequired
                      error={error.length > 0}
                      errorText={error}
                    />
                  </div>
                  <div className="mt-4 ml-1">
                    <Checkbox
                      addAllUsers={addAllUsers}
                      setAddAllUsers={setAddAllUsers}
                    />
                  </div>
                  <div className="mt-4 max-w-min">
                    <Button
                      onButtonPressed={submit}
                      loading={loading}
                      color="mineshaft"
                      text="Create"
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

export default AddWorkspaceDialog;
