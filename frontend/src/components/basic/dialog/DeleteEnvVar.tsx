import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, Transition } from "@headlessui/react";

// #TODO: USE THIS. Currently it's not. Kinda complicated to set up because of state.

type Props = {
  isOpen: boolean
  onClose: () => void
  onSubmit: () => void 
}

export const DeleteEnvVar = ({ isOpen, onClose, onSubmit }: Props) => {
  const { t } = useTranslation()
  return (
    <div>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-[80]" onClose={() => {}}>
          <div className="fixed inset-0 overflow-y-auto">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div
                className="fixed inset-0 bg-black bg-opacity-70"
                onClick={onClose}
                onKeyDown={onClose}
                role="button"
                tabIndex={0}
                aria-label="Close"
              />
            </Transition.Child>
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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-md bg-bunker border border-mineshaft-600 p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-bunker-200">
                    {t("dashboard:sidebar.delete-key-dialog.title")}
                  </Dialog.Title>
                  <div className="mt-2">
                    <p className="text-sm text-bunker-300">
                      {t("dashboard:sidebar.delete-key-dialog.confirm-delete-message")}
                    </p>
                  </div>
                  <div className="mt-6 flex justify-start">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-transparent bg-red-500 opacity-80 hover:opacity-100 px-4 py-2 text-sm font-medium text-bunker-100 text-semibold duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      onClick={onSubmit}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="ml-2 inline-flex justify-center rounded-md border border-transparent bg-bunker-500 px-4 py-2 text-sm font-medium text-gray-400 hover:bg-mineshaft-500 hover:text-white hover:text-semibold duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      onClick={onClose}
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
