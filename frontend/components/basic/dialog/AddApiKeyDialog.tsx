import { Fragment, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { faCheck, faCopy } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Dialog, Transition } from '@headlessui/react';

import addAPIKey from '~/pages/api/apiKey/addAPIKey';

import Button from '../buttons/Button';
import InputField from '../InputField';
import ListBox from '../Listbox';

const expiryMapping = {
  '1 day': 86400,
  '7 days': 604800,
  '1 month': 2592000,
  '6 months': 15552000,
  '12 months': 31104000,
};

type Props = {
  isOpen: boolean;
  closeModal: () => void;
  // TODO: These never and any will be filled by single folder that contains types and hooks about the API
  apiKeys: any[];
  setApiKeys: (arg: any[]) => void;
};

// TODO: convert to TS
const AddApiKeyDialog = ({
  isOpen,
  closeModal,
  apiKeys,
  setApiKeys,
}: Props) => {
  const [apiKey, setApiKey] = useState('');
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyExpiresIn, setApiKeyExpiresIn] = useState('1 day');
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const { t } = useTranslation();

  const generateAPIKey = async () => {
    const newApiKey = await addAPIKey({
      name: apiKeyName,
      expiresIn: expiryMapping[apiKeyExpiresIn as keyof typeof expiryMapping],
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
    <div className='z-50'>
      <Transition appear show={isOpen} as={Fragment}>
        <Dialog as='div' className='relative' onClose={closeModal}>
          <Transition.Child
            as={Fragment}
            enter='ease-out duration-300'
            enterFrom='opacity-0'
            enterTo='opacity-100'
            leave='ease-in duration-200'
            leaveFrom='opacity-100'
            leaveTo='opacity-0'
          >
            <div className='fixed inset-0 bg-bunker-700 bg-opacity-80' />
          </Transition.Child>

          <div className='fixed inset-0 overflow-y-auto'>
            <div className='flex min-h-full items-center justify-center p-4 text-center'>
              <Transition.Child
                as={Fragment}
                enter='ease-out duration-300'
                enterFrom='opacity-0 scale-95'
                enterTo='opacity-100 scale-100'
                leave='ease-in duration-200'
                leaveFrom='opacity-100 scale-100'
                leaveTo='opacity-0 scale-95'
              >
                {apiKey == '' ? (
                  <Dialog.Panel className='w-full max-w-md transform rounded-md bg-bunker-800 border border-gray-700 p-6 text-left align-middle shadow-xl transition-all'>
                    <Dialog.Title
                      as='h3'
                      className='text-lg font-medium leading-6 text-gray-400 z-50'
                    >
                      {t('section-api-key:add-dialog.title')}
                    </Dialog.Title>
                    <div className='mt-2 mb-4'>
                      <div className='flex flex-col'>
                        <p className='text-sm text-gray-500'>
                          {t('section-api-key:add-dialog.description')}
                        </p>
                      </div>
                    </div>
                    <div className='max-h-28 mb-2'>
                      <InputField
                        label={t('section-api-key:add-dialog.name')}
                        onChangeHandler={setApiKeyName}
                        type='varName'
                        value={apiKeyName}
                        placeholder=''
                        isRequired
                      />
                    </div>
                    <div className='max-h-28'>
                      <ListBox
                        selected={apiKeyExpiresIn}
                        onChange={setApiKeyExpiresIn}
                        data={[
                          '1 day',
                          '7 days',
                          '1 month',
                          '6 months',
                          '12 months',
                        ]}
                        isFull={true}
                        text={`${t('common:expired-in')}: `}
                      />
                    </div>
                    <div className='max-w-max'>
                      <div className='mt-6 flex flex-col justify-start w-max'>
                        <Button
                          onButtonPressed={() => generateAPIKey()}
                          color='mineshaft'
                          text={t('section-api-key:add-dialog.add') as string}
                          textDisabled={
                            t('section-api-key:add-dialog.add') as string
                          }
                          size='md'
                          active={apiKeyName == '' ? false : true}
                        />
                      </div>
                    </div>
                  </Dialog.Panel>
                ) : (
                  <Dialog.Panel className='w-full max-w-md transform rounded-md bg-bunker-800 border border-gray-700 p-6 text-left align-middle shadow-xl transition-all'>
                    <Dialog.Title
                      as='h3'
                      className='text-lg font-medium leading-6 text-gray-400 z-50'
                    >
                      {t('section-api-key:add-dialog.copy-service-token')}
                    </Dialog.Title>
                    <div className='mt-2 mb-4'>
                      <div className='flex flex-col'>
                        <p className='text-sm text-gray-500'>
                          {t(
                            'section-api-key:add-dialog.copy-service-token-description'
                          )}
                        </p>
                      </div>
                    </div>
                    <div className='w-full'>
                      <div className='flex justify-end items-center bg-white/[0.07] text-base mt-2 mr-2 rounded-md text-gray-400 w-full h-20'>
                        <input
                          type='text'
                          value={apiKey}
                          disabled={true}
                          id='apiKey'
                          className='invisible bg-white/0 text-gray-400 py-2 w-full px-2 min-w-full outline-none'
                        ></input>
                        <div className='bg-white/0 max-w-md text-sm text-gray-400 py-2 w-full pl-14 pr-2 break-words outline-none'>
                          {apiKey}
                        </div>
                        <div className='group font-normal h-full relative inline-block text-gray-400 underline hover:text-primary duration-200'>
                          <button
                            onClick={copyToClipboard}
                            className='h-full pl-3.5 pr-4 border-l border-white/20 py-2 hover:bg-white/[0.12] duration-200'
                          >
                            {apiKeyCopied ? (
                              <FontAwesomeIcon
                                icon={faCheck}
                                className='pr-0.5'
                              />
                            ) : (
                              <FontAwesomeIcon icon={faCopy} />
                            )}
                          </button>
                          <span className='absolute hidden group-hover:flex group-hover:animate-popup duration-300 w-28 -left-8 -top-20 translate-y-full px-3 py-2 bg-chicago-900 rounded-md text-center text-gray-400 text-sm'>
                            {t('common:click-to-copy')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className='mt-6 flex flex-col justify-start w-max'>
                      <Button
                        onButtonPressed={() => closeAddApiKeyModal()}
                        color='mineshaft'
                        text='Close'
                        size='md'
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
