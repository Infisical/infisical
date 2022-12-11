import { Fragment, useState } from 'react';
import { faCheck, faCopy } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Dialog, Transition } from '@headlessui/react';
import nacl from 'tweetnacl';

import addServiceToken from '~/pages/api/serviceToken/addServiceToken';
import getLatestFileKey from '~/pages/api/workspace/getLatestFileKey';

import { envMapping } from '../../../public/data/frequentConstants';
import {
  decryptAssymmetric,
  encryptAssymmetric
} from '../../utilities/cryptography/crypto';
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

const AddServiceTokenDialog = ({
  isOpen,
  closeModal,
  workspaceId,
  workspaceName
}) => {
  const [serviceToken, setServiceToken] = useState('');
  const [serviceTokenName, setServiceTokenName] = useState('');
  const [serviceTokenEnv, setServiceTokenEnv] = useState('Development');
  const [serviceTokenExpiresIn, setServiceTokenExpiresIn] = useState('1 day');
  const [serviceTokenCopied, setServiceTokenCopied] = useState(false);

  const generateServiceToken = async () => {
    const latestFileKey = await getLatestFileKey({ workspaceId });

    const key = decryptAssymmetric({
      ciphertext: latestFileKey.latestKey.encryptedKey,
      nonce: latestFileKey.latestKey.nonce,
      publicKey: latestFileKey.latestKey.sender.publicKey,
      privateKey: localStorage.getItem('PRIVATE_KEY')
    });

    // generate new public/private key pair
    const pair = nacl.box.keyPair();
    const publicKey = nacl.util.encodeBase64(pair.publicKey);
    const privateKey = nacl.util.encodeBase64(pair.secretKey);

    // encrypt workspace key under newly-generated public key
    const { ciphertext: encryptedKey, nonce } = encryptAssymmetric({
      plaintext: key,
      publicKey,
      privateKey
    });

    let newServiceToken = await addServiceToken({
      name: serviceTokenName,
      workspaceId,
      environment: envMapping[serviceTokenEnv],
      expiresIn: expiryMapping[serviceTokenExpiresIn],
      publicKey,
      encryptedKey,
      nonce
    });

    const serviceToken = newServiceToken + ',' + privateKey;
    setServiceToken(serviceToken);
  };

  function copyToClipboard() {
    // Get the text field
    var copyText = document.getElementById('serviceToken');

    // Select the text field
    copyText.select();
    copyText.setSelectionRange(0, 99999); // For mobile devices

    // Copy the text inside the text field
    navigator.clipboard.writeText(copyText.value);

    setServiceTokenCopied(true);
    setTimeout(() => setServiceTokenCopied(false), 2000);
    // Alert the copied text
    // alert("Copied the text: " + copyText.value);
  }

  const closeAddServiceTokenModal = () => {
    closeModal();
    setServiceTokenName('');
    setServiceToken('');
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
                {serviceToken == '' ? (
                  <Dialog.Panel className="w-full max-w-md transform rounded-md bg-bunker-800 border border-gray-700 p-6 text-left align-middle shadow-xl transition-all">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-medium leading-6 text-gray-400 z-50"
                    >
                      Add a service token for {workspaceName}
                    </Dialog.Title>
                    <div className="mt-2 mb-4">
                      <div className="flex flex-col">
                        <p className="text-sm text-gray-500">
                          Specify the name, environment, and expiry period. When
                          a token is generated, you will only be able to see it
                          once before it disappears. Make sure to save it
                          somewhere.
                        </p>
                      </div>
                    </div>
                    <div className="max-h-28 mb-2">
                      <InputField
                        label="Service Token Name"
                        onChangeHandler={setServiceTokenName}
                        type="varName"
                        value={serviceTokenName}
                        placeholder=""
                        isRequired
                      />
                    </div>
                    <div className="max-h-28 mb-2">
                      <ListBox
                        selected={serviceTokenEnv}
                        onChange={setServiceTokenEnv}
                        data={[
                          'Development',
                          'Staging',
                          'Production',
                          'Testing'
                        ]}
                        isFull={true}
                        text="Environment: "
                      />
                    </div>
                    <div className="max-h-28">
                      <ListBox
                        selected={serviceTokenExpiresIn}
                        onChange={setServiceTokenExpiresIn}
                        data={[
                          '1 day',
                          '7 days',
                          '1 month',
                          '6 months',
                          '12 months'
                        ]}
                        isFull={true}
                        text="Expires in: "
                      />
                    </div>
                    <div className="max-w-max">
                      <div className="mt-6 flex flex-col justify-start w-max">
                        <Button
                          onButtonPressed={() => generateServiceToken()}
                          color="mineshaft"
                          text="Add Service Token"
                          textDisabled="Add Service Token"
                          size="md"
                          active={serviceTokenName == '' ? false : true}
                        />
                      </div>
                    </div>
                  </Dialog.Panel>
                ) : (
                  <Dialog.Panel className="w-full max-w-md transform rounded-md bg-bunker-800 border border-gray-700 p-6 text-left align-middle shadow-xl transition-all">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-medium leading-6 text-gray-400 z-50"
                    >
                      Copy your service token
                    </Dialog.Title>
                    <div className="mt-2 mb-4">
                      <div className="flex flex-col">
                        <p className="text-sm text-gray-500">
                          Once you close this popup, you will never see your
                          service token again
                        </p>
                      </div>
                    </div>
                    <div className="w-full">
                      <div className="flex justify-end items-center bg-white/[0.07] text-base mt-2 mr-2 rounded-md text-gray-400 w-full h-36">
                        <input
                          type="text"
                          value={serviceToken}
                          id="serviceToken"
                          className="invisible bg-white/0 text-gray-400 py-2 w-full px-2 min-w-full outline-none"
                        ></input>
                        <div className="bg-white/0 max-w-md text-sm text-gray-400 py-2 w-full pl-14 pr-2 break-words outline-none">
                          {serviceToken}
                        </div>
                        <div className="group font-normal h-full relative inline-block text-gray-400 underline hover:text-primary duration-200">
                          <button
                            onClick={copyToClipboard}
                            className="h-full pl-3.5 pr-4 border-l border-white/20 py-2 hover:bg-white/[0.12] duration-200"
                          >
                            {serviceTokenCopied ? (
                              <FontAwesomeIcon
                                icon={faCheck}
                                className="pr-0.5"
                              />
                            ) : (
                              <FontAwesomeIcon icon={faCopy} />
                            )}
                          </button>
                          <span className="absolute hidden group-hover:flex group-hover:animate-popup duration-300 w-28 -left-8 -top-20 translate-y-full px-3 py-2 bg-chicago-900 rounded-md text-center text-gray-400 text-sm">
                            Click to Copy
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex flex-col justify-start w-max">
                      <Button
                        onButtonPressed={() => closeAddServiceTokenModal()}
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

export default AddServiceTokenDialog;
