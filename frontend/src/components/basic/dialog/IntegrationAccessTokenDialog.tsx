import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";

import Button from "../buttons/Button";
import InputField from "../InputField";

interface IntegrationOption {
  clientId: string;
  clientSlug?: string; // vercel-integration specific
  docsLink: string;
  image: string;
  isAvailable: boolean;
  name: string;
  slug: string;
  type: string;
}

type Props = {
  isOpen: boolean;
  closeModal: () => void;
  selectedIntegrationOption: IntegrationOption | null
  handleIntegrationOption: (arg:{
    integrationOption: IntegrationOption,
    accessToken?: string;
})=>void;
};

const IntegrationAccessTokenDialog = ({
    isOpen,
    closeModal,
    selectedIntegrationOption,
    handleIntegrationOption
}:Props) => {
    const [accessToken, setAccessToken] = useState('');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const submit = async () => {
        try {
            if (selectedIntegrationOption && accessToken !== '') {
                handleIntegrationOption({
                    integrationOption: selectedIntegrationOption,
                    accessToken
                });
                closeModal();
                setAccessToken('');
            }
        } catch (err) {
            console.log(err);
        }
    }

    return (
        <div>
            <Transition appear show={isOpen} as={Fragment}>
                <Dialog as="div" className="relative z-10" onClose={() => {
                    console.log('onClose');
                    closeModal();
                }}>
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
                                    {`Enter your ${selectedIntegrationOption?.name} API Key`}
                                </Dialog.Title>
                                <div className="mt-2 mb-2">
                                    <p className="text-sm text-gray-500">
                                        {`This integration requires you to obtain an API key from ${selectedIntegrationOption?.name ?? ''} and store it with Infisical.`}
                                    </p>
                                </div>
                                <div className="mt-6 max-w-max">
                                    <InputField
                                        label="API Key"
                                        onChangeHandler={setAccessToken}
                                        type="varName"
                                        value={accessToken}
                                        placeholder=""
                                        isRequired
                                    />
                                    <div className="mt-4">
                                        <Button 
                                            onButtonPressed={submit}
                                            color="mineshaft"
                                            text="Connect"
                                            size="md"
                                        />
                                    </div>
                                </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </div>
    );
}

export default IntegrationAccessTokenDialog;