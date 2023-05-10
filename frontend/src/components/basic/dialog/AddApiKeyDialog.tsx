import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { faCheck, faCopy } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Dialog, Transition } from '@headlessui/react';

import addAPIKey from '@app/pages/api/apiKey/addAPIKey';

import Button from '../buttons/Button';
import InputField from '../InputField';
import ListBox from '../Listbox';

const expiryMapping = {
  '1 day': 86400,
  '7 days': 604800,
  '1 month': 2592000,
  '6 months': 15552000,
  '12 months': 31104000
};

type Props = {
  isOpen: boolean;
  closeModal: () => void;
  // TODO: These never and any will be filled by single folder that contains types and hooks about the API
  apiKeys: any[];
  setApiKeys: (arg: any[]) => void;
};

// TODO: convert to TS
const AddApiKeyDialog = ({ isOpen, closeModal, apiKeys, setApiKeys }: Props) => {
  const [apiKey, setApiKey] = useState('');
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyExpiresIn, setApiKeyExpiresIn] = useState('1 day');
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const { t } = useTranslation();

  const generateAPIKey = async () => {
    const newApiKey = await addAPIKey({
      name: apiKeyName,
      expiresIn: expiryMapping[apiKeyExpiresIn as keyof typeof expiryMapping]
    });

    setApiKeys([...apiKeys, newApiKey.apiKeyData]);
    setApiKey(newApiKey.apiKey);
  };

  function copyToClipboard() {
    // Get the text field
    const copyText = document.getElementById('apiKey') as HTMLInputElement;

    // Select the text field
    copyText.select();
    copyText.setSelectionRange(0, 99999); // For mobile devices

    // Copy the text inside the text field
    navigator.clipboard.writeText(copyText.value);

    setApiKeyCopied(true);
    setTimeout(() => setApiKeyCopied(false), 2000);
    // Alert the copied text
    // alert("Copied the text: " + copyText.value);
  }

  const closeAddApiKeyModal = () => {
    closeModal();
    setApiKeyName('');
    setApiKey('');
  };

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
            <div className="fixed inset-0 bg-bunker-700 bg-opacity-80" />
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
                {apiKey === '' ? (
                  <Dialog.Panel className="w-full max-w-md transform rounded-md border border-gray-700 bg-bunker-800 p-6 text-left align-middle shadow-xl transition-all">
                    <Dialog.Title
                      as="h3"
                      className="z-50 text-lg font-medium leading-6 text-gray-400"
                    >
                      {t('section.api-key.add-dialog.title')}
                    </Dialog.Title>
                    <div className="mt-2 mb-4">
                      <div className="flex flex-col">
                        <p className="text-sm text-gray-500">
                          {t('section.api-key.add-dialog.description')}
                        </p>
                      </div>
                    </div>
                    <div className="mb-2 max-h-28">
                      <InputField
                        label={t('section.api-key.add-dialog.name')}
                        onChangeHandler={setApiKeyName}
                        type="varName"
                        value={apiKeyName}
                        placeholder=""
                        isRequired
                      />
                    </div>
                    <div className="max-h-28">
                      <ListBox
                        isSelected={apiKeyExpiresIn}
                        onChange={setApiKeyExpiresIn}
                        data={['1 day', '7 days', '1 month', '6 months', '12 months']}
                        isFull
                        text={`${t('common.expired-in')}: `}
                      />
                    </div>
                    <div className="max-w-max">
                      <div className="mt-6 flex w-max flex-col justify-start">
                        <Button
                          onButtonPressed={() => generateAPIKey()}
                          color="mineshaft"
                          text={t('section.api-key.add-dialog.add') as string}
                          textDisabled={t('section.api-key.add-dialog.add') as string}
                          size="md"
                          active={apiKeyName !== ''}
                        />
                      </div>
                    </div>
                  </Dialog.Panel>
                ) : (
                  <Dialog.Panel className="w-full max-w-md transform rounded-md border border-gray-700 bg-bunker-800 p-6 text-left align-middle shadow-xl transition-all">
                    <Dialog.Title
                      as="h3"
                      className="z-50 text-lg font-medium leading-6 text-gray-400"
                    >
                      {t('section.api-key.add-dialog.copy-service-token')}
                    </Dialog.Title>
                    <div className="mt-2 mb-4">
                      <div className="flex flex-col">
                        <p className="text-sm text-gray-500">
                          {t('section.api-key.add-dialog.copy-service-token-description')}
                        </p>
                      </div>
                    </div>
                    <div className="w-full">
                      <div className="mt-2 mr-2 flex h-20 w-full items-center justify-end rounded-md bg-white/[0.07] text-base text-gray-400">
                        <input
                          type="text"
                          value={apiKey}
                          disabled
                          id="apiKey"
                          className="invisible w-full min-w-full bg-white/0 py-2 px-2 text-gray-400 outline-none"
                        />
                        <div className="w-full max-w-md break-words bg-white/0 py-2 pl-14 pr-2 text-sm text-gray-400 outline-none">
                          {apiKey}
                        </div>
                        <div className="group relative inline-block h-full font-normal text-gray-400 underline duration-200 hover:text-primary">
                          <button
                            type="button"
                            onClick={copyToClipboard}
                            className="h-full border-l border-white/20 py-2 pl-3.5 pr-4 duration-200 hover:bg-white/[0.12]"
                          >
                            {apiKeyCopied ? (
                              <FontAwesomeIcon icon={faCheck} className="pr-0.5" />
                            ) : (
                              <FontAwesomeIcon icon={faCopy} />
                            )}
                          </button>
                          <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-chicago-900 px-3 py-2 text-center text-sm text-gray-400 duration-300 group-hover:flex group-hover:animate-popup">
                            {t('common.click-to-copy')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex w-max flex-col justify-start">
                      <Button
                        onButtonPressed={() => closeAddApiKeyModal()}
                        color="mineshaft"
                        text="Close"
                        size="md"
                      />
                    </div>
                  </Dialog.Panel>
                )}
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

export default AddApiKeyDialog;
