import { Fragment } from "react";
import { useRouter } from "next/router";
import { Dialog, Transition } from "@headlessui/react";

import { STRIPE_PRODUCT_STARTER } from "../../utilities/config";
import Button from "../buttons/Button";
import InputField from "../InputField";

const AddUserDialog = ({
  isOpen,
  closeModal,
  submitModal,
  email,
  workspaceId,
  setEmail,
  currentPlan,
  orgName,
}) => {
  const submit = () => {
    submitModal(email);
  };
  const router = useRouter();

  return (
    <div className="z-50">
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative" onClose={closeModal}>
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
                <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-md bg-bunker-800 border border-gray-700 p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-400 z-50"
                  >
                    Invite others to {orgName}
                  </Dialog.Title>
                  <div className="mt-2 mb-4">
                    <p className="text-sm text-gray-500">
                      An invite is specific to an email address and expires
                      after 1 day. For security reasons, you will need to
                      separately add members to projects.
                    </p>
                  </div>
                  <div className="max-h-28">
                    <InputField
                      label="Email"
                      onChangeHandler={setEmail}
                      type="varName"
                      value={email}
                      placeholder=""
                      isRequired
                    />
                  </div>
                  {currentPlan == STRIPE_PRODUCT_STARTER && (
                    <div className="flex flex-row">
                      <button
                        type="button"
                        className="inline-flex justify-center rounded-md py-1 text-sm text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        onClick={() =>
                          router.push("/settings/billing/" + router.query.id)
                        }
                      >
                        You can add up to 5 members on a Free tier.
                      </button>
                      <button
                        type="button"
                        className="ml-1 inline-flex justify-center rounded-md py-1 text-sm text-gray-500 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        onClick={() =>
                          router.push("/settings/billing/" + router.query.id)
                        }
                      >
                        Upgrade now.
                      </button>
                    </div>
                  )}
                  <div className="mt-4 max-w-max">
                    <Button
                      onButtonPressed={submit}
                      color="mineshaft"
                      text="Invite"
                      size="md"
                    />
                  </div>
                </Dialog.Panel>
                {/* <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-md bg-bunker-800 border border-gray-700 p-6 text-left align-middle shadow-xl transition-all">
									<Dialog.Title
										as="h3"
										className="text-xl font-medium leading-6 text-gray-300 z-50"
									>
										Unleash Infisical's Full Power
									</Dialog.Title>
									<div className="mt-4 mb-4">
										<p className="text-sm text-gray-400 mb-2">
											You have exceeded the number of members in a free organization.
										</p>
										<p className="text-sm text-gray-400">
											Upgrade now and get access to adding more members, as well as to other powerful enhancements.
										</p>
									</div>
									<div className="mt-6">
										<button
											type="button"
											className="inline-flex justify-center rounded-md border border-transparent bg-primary px-4 py-2 text-sm font-medium text-black hover:opacity-80 hover:text-semibold duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
											onClick={() => router.push("/settings/billing/" + router.query.id)}
										>
											Upgrade Now
										</button>
										<button
											type="button"
											className="ml-2 inline-flex justify-center rounded-md border border-transparent bg-gray-800 px-4 py-2 text-sm font-medium text-gray-400 hover:bg-gray-500 hover:text-black hover:text-semibold duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
											onClick={closeModal}
										>
											Maybe Later
										</button>
									</div>
								</Dialog.Panel> */}
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

export default AddUserDialog;
