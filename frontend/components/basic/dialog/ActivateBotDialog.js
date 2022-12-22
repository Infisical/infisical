import { Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";

import setBotActiveStatus from "../../../pages/api/bot/setBotActiveStatus";
import getLatestFileKey from "../../../pages/api/workspace/getLatestFileKey";
import { 
    decryptAssymmetric,
    encryptAssymmetric
} from "../../utilities/cryptography/crypto";
import Button from "../buttons/Button";

const ActivateBotDialog = ({
    isOpen,
    closeModal,
    selectedIntegrationOption,
    handleBotActivate,
    handleIntegrationOption
}) => {
    
    const submit = async () => {
        try {
            // 1. activate bot
            await handleBotActivate();
            
            // 2. start integration
            await handleIntegrationOption({
                integrationOption: selectedIntegrationOption
            });
        } catch (err) {
            console.log(err);
        }
        
        closeModal();
    }

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
                                    Grant Infisical access to your secrets
                                </Dialog.Title>
                                <div className="mt-2 mb-2">
                                    <p className="text-sm text-gray-500">
                                        Most cloud integrations require Infisical to be able to decrypt your secrets so they can be forwarded over.
                                    </p>
                                </div>
                                <div className="mt-6 max-w-max">
                                    <Button 
                                        onButtonPressed={submit}
                                        color="mineshaft"
                                        text="Grant access"
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
}

export default ActivateBotDialog;