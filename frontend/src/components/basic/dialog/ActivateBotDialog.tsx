import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, Transition } from "@headlessui/react";

import Button from "../buttons/Button";

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
  selectedIntegrationOption: IntegrationOption | null;
  integrationOptionPress: (integrationOption: IntegrationOption) => void;
};

const ActivateBotDialog = ({
  isOpen,
  closeModal,
  selectedIntegrationOption,
  integrationOptionPress
}: Props) => {
  const { t } = useTranslation();

  const submit = async () => {
    try {
      // type check
      if (!selectedIntegrationOption) return;

      // start integration or probe for PAT
      integrationOptionPress(selectedIntegrationOption);
    } catch (err) {
      console.log(err);
    }

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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-md border border-gray-700 bg-bunker-800 p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-400">
                    {t("integrations.grant-access-to-secrets")}
                  </Dialog.Title>
                  <div className="mt-2 mb-2">
                    <p className="text-sm text-gray-500">
                      {t("integrations.why-infisical-needs-access")}
                    </p>
                  </div>
                  <div className="mt-6 max-w-max">
                    <Button
                      onButtonPressed={submit}
                      color="mineshaft"
                      text={t("integrations.grant-access-button") as string}
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

export default ActivateBotDialog;
