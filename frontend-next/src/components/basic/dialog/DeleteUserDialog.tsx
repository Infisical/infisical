import { Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";

// #TODO: USE THIS. Currently it's not. Kinda complicated to set up because of state.

type Props = {
  isOpen: boolean;
  closeModal: () => void;
  submitModal: (userIdToBeDeleted: string) => void;
  userIdToBeDeleted: string;
};

const DeleteUserDialog = ({ isOpen, closeModal, submitModal, userIdToBeDeleted }: Props) => {
  const submit = () => {
    submitModal(userIdToBeDeleted);
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
            <div className="fixed inset-0 bg-black bg-opacity-25" />
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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl border border-gray-700 bg-grey p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-400">
                    Are you sure you want to remove this user from the workspace?
                  </Dialog.Title>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">This action is irrevertible.</p>
                  </div>
                  <div className="mt-6">
                    <button
                      type="button"
                      className="hover:bg-alizarin hover:text-semibold inline-flex justify-center rounded-md border border-transparent bg-gray-800 px-4 py-2 text-sm font-medium text-gray-400 duration-200 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      onClick={submit}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="hover:text-semibold ml-2 inline-flex justify-center rounded-md border border-transparent bg-gray-800 px-4 py-2 text-sm font-medium text-gray-400 duration-200 hover:border-white hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      onClick={submit}
                    >
                      Cancel
                    </button>
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

export default DeleteUserDialog;
