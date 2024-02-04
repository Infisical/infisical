import { Fragment } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useRouter } from "next/router";
import { Dialog, Transition } from "@headlessui/react";

import Button from "../buttons/Button";
import ListBox from "../Listbox";

type Props = {
  isOpen: boolean;
  closeModal: () => void;
  submitModal: () => void;
  data: any;
  email: string;
  setEmail: (email: string) => void;
};

const AddProjectMemberDialog = ({
  isOpen,
  closeModal,
  submitModal,
  data,
  email,
  setEmail
}: Props) => {
  const router = useRouter();
  const { t } = useTranslation();

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
                <Dialog.Panel className="w-full max-w-md transform rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6 text-left align-middle shadow-xl transition-all">
                  {data?.length > 0 ? (
                    <Dialog.Title
                      as="h3"
                      className="z-50 text-lg font-medium leading-6 text-gray-400"
                    >
                      {t("section.members.add-dialog.add-member-to-project")}
                    </Dialog.Title>
                  ) : (
                    <Dialog.Title
                      as="h3"
                      className="z-50 text-lg font-medium text-mineshaft-300 mb-4"
                    >
                      {t("section.members.add-dialog.already-all-invited")}
                    </Dialog.Title>
                  )}
                  <div className="mt-2 mb-4">
                    {data?.length > 0 ? (
                      <div className="flex flex-col">
                        <p className="text-sm text-gray-500">
                          {t("section.members.add-dialog.user-will-email")}
                        </p>
                        <div className="">
                          <Trans
                            i18nKey="section.members.add-dialog.looking-add"
                            components={[
                              // eslint-disable-next-line react/jsx-key
                              <button
                                type="button"
                                className="inline-flex justify-center rounded-md py-1 text-sm text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                onClick={() => router.push(`/org/${router.query.id}/members`)}
                                aria-label="add member"
                              />,
                              // eslint-disable-next-line react/jsx-key
                              <button
                                type="button"
                                className="ml-1 inline-flex justify-center rounded-md py-1 text-sm text-gray-500 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                onClick={() =>
                                  router.push(`/org/${router.query.id}/members?action=invite`)
                                }
                                aria-label="add member"
                              />
                            ]}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">
                        {t("section.members.add-dialog.add-user-org-first")}
                      </p>
                    )}
                  </div>
                  <div className="max-h-28">
                    {data?.length > 0 && (
                      <ListBox
                        isSelected={email || data[0]}
                        onChange={setEmail}
                        data={data}
                        isFull
                      />
                    )}
                  </div>
                  <div className="max-w-max">
                    {data?.length > 0 ? (
                      <div className="mt-6 flex w-max flex-col justify-start">
                        <Button
                          onButtonPressed={submitModal}
                          color="mineshaft"
                          text={t("section.members.add-member") as string}
                          size="md"
                        />
                      </div>
                    ) : (
                      <Button
                        onButtonPressed={() => router.push(`/org/${localStorage.getItem("orgData.id")}/members`)}
                        color="mineshaft"
                        text={t("section.members.add-dialog.add-user-to-org") as string}
                        size="md"
                      />
                    )}
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

export default AddProjectMemberDialog;
