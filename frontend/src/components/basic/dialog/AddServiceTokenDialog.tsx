import crypto from "crypto";

import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Dialog, Transition } from "@headlessui/react";

import addServiceToken from "@app/pages/api/serviceToken/addServiceToken";
import getLatestFileKey from "@app/pages/api/workspace/getLatestFileKey";

import { decryptAssymmetric, encryptSymmetric } from "../../utilities/cryptography/crypto";
import Button from "../buttons/Button";
import InputField from "../InputField";
import ListBox from "../Listbox";

const expiryMapping = {
  "1 day": 86400,
  "7 days": 604800,
  "1 month": 2592000,
  "6 months": 15552000,
  "12 months": 31104000
};

type Props = {
  isOpen: boolean;
  closeModal: () => void;
  workspaceId: string;
  workspaceName: string;
  serviceTokens: any[];
  environments: Array<{ name: string; slug: string }>;
  setServiceTokens: (arg: any[]) => void;
};

const AddServiceTokenDialog = ({
  isOpen,
  closeModal,
  workspaceId,
  workspaceName,
  serviceTokens,
  environments,
  setServiceTokens
}: Props) => {
  const [serviceToken, setServiceToken] = useState("");
  const [serviceTokenName, setServiceTokenName] = useState("");
  const [selectedServiceTokenEnv, setSelectedServiceTokenEnv] = useState(environments?.[0]);
  const [serviceTokenExpiresIn, setServiceTokenExpiresIn] = useState("1 day");
  const [serviceTokenCopied, setServiceTokenCopied] = useState(false);
  const { t } = useTranslation();

  const generateServiceToken = async () => {
    const latestFileKey = await getLatestFileKey({ workspaceId });

    const key = decryptAssymmetric({
      ciphertext: latestFileKey.latestKey.encryptedKey,
      nonce: latestFileKey.latestKey.nonce,
      publicKey: latestFileKey.latestKey.sender.publicKey,
      privateKey: localStorage.getItem("PRIVATE_KEY") as string
    });

    const randomBytes = crypto.randomBytes(16).toString("hex");
    const { ciphertext, iv, tag } = encryptSymmetric({
      plaintext: key,
      key: randomBytes
    });

    console.log(
      1234,
      selectedServiceTokenEnv,
      environments,
      selectedServiceTokenEnv?.slug ? selectedServiceTokenEnv.slug : environments[0]?.slug
    );
    const newServiceToken = await addServiceToken({
      name: serviceTokenName,
      workspaceId,
      environment: selectedServiceTokenEnv?.slug
        ? selectedServiceTokenEnv.slug
        : environments[0]?.slug,
      expiresIn: expiryMapping[serviceTokenExpiresIn as keyof typeof expiryMapping],
      encryptedKey: ciphertext,
      iv,
      tag
    });

    setServiceTokens(serviceTokens.concat([newServiceToken.serviceTokenData]));
    setServiceToken(`${newServiceToken.serviceToken}.${randomBytes}`);
  };

  function copyToClipboard() {
    // Get the text field
    const copyText = document.getElementById("serviceToken") as HTMLInputElement;

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
    setServiceTokenName("");
    setServiceToken("");
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
                {serviceToken === "" ? (
                  <Dialog.Panel className="w-full max-w-md transform rounded-md border border-gray-700 bg-bunker-800 p-6 text-left align-middle shadow-xl transition-all">
                    <Dialog.Title
                      as="h3"
                      className="z-50 text-lg font-medium leading-6 text-gray-400"
                    >
                      {t("section.token.add-dialog.title", {
                        target: workspaceName
                      })}
                    </Dialog.Title>
                    <div className="mt-2 mb-4">
                      <div className="flex flex-col">
                        <p className="text-sm text-gray-500">
                          {t("section.token.add-dialog.description")}
                        </p>
                      </div>
                    </div>
                    <div className="mb-2 max-h-28">
                      <InputField
                        label={t("section.token.add-dialog.name")}
                        onChangeHandler={setServiceTokenName}
                        type="varName"
                        value={serviceTokenName}
                        placeholder=""
                        isRequired
                      />
                    </div>
                    <div className="mb-2 max-h-28">
                      <ListBox
                        isSelected={
                          selectedServiceTokenEnv?.name
                            ? selectedServiceTokenEnv?.name
                            : environments[0]?.name
                        }
                        data={environments.map(({ name }) => name)}
                        onChange={(envName) =>
                          setSelectedServiceTokenEnv(
                            environments.find(({ name }) => envName === name) || {
                              name: "unknown",
                              slug: "unknown"
                            }
                          )
                        }
                        isFull
                        text={`${t("common.environment")}: `}
                      />
                    </div>
                    <div className="max-h-28">
                      <ListBox
                        isSelected={serviceTokenExpiresIn}
                        onChange={setServiceTokenExpiresIn}
                        data={["1 day", "7 days", "1 month", "6 months", "12 months"]}
                        isFull
                        text={`${t("common.expired-in")}: `}
                      />
                    </div>
                    <div className="max-w-max">
                      <div className="mt-6 flex w-max flex-col justify-start">
                        <Button
                          onButtonPressed={() => generateServiceToken()}
                          color="mineshaft"
                          text={t("section.token.add-dialog.add") as string}
                          textDisabled={t("section.token.add-dialog.add") as string}
                          size="md"
                          active={serviceTokenName !== ""}
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
                      {t("section.token.add-dialog.copy-service-token")}
                    </Dialog.Title>
                    <div className="mt-2 mb-4">
                      <div className="flex flex-col">
                        <p className="text-sm text-gray-500">
                          {t("section.token.add-dialog.copy-service-token-description")}
                        </p>
                      </div>
                    </div>
                    <div className="w-full">
                      <div className="mt-2 mr-2 flex h-20 w-full items-center justify-end rounded-md bg-white/[0.07] text-base text-gray-400">
                        <input
                          type="text"
                          value={serviceToken}
                          id="serviceToken"
                          className="invisible w-full min-w-full bg-white/0 py-2 px-2 text-gray-400 outline-none"
                        />
                        <div className="w-full max-w-md break-words bg-white/0 py-2 pl-14 pr-2 text-sm text-gray-400 outline-none">
                          {serviceToken}
                        </div>
                        <div className="group relative inline-block h-full font-normal text-gray-400 underline duration-200 hover:text-primary">
                          <button
                            onClick={copyToClipboard}
                            type="button"
                            className="h-full border-l border-white/20 py-2 pl-3.5 pr-4 duration-200 hover:bg-white/[0.12]"
                          >
                            {serviceTokenCopied ? (
                              <FontAwesomeIcon icon={faCheck} className="pr-0.5" />
                            ) : (
                              <FontAwesomeIcon icon={faCopy} />
                            )}
                          </button>
                          <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-chicago-900 px-3 py-2 text-center text-sm text-gray-400 duration-300 group-hover:flex group-hover:animate-popup">
                            {t("common.click-to-copy")}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex w-max flex-col justify-start">
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
