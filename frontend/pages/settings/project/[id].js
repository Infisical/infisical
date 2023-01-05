import { useEffect, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { faCheck, faCopy, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from "~/components/basic/buttons/Button";
import AddServiceTokenDialog from "~/components/basic/dialog/AddServiceTokenDialog";
import InputField from "~/components/basic/InputField";
import ServiceTokenTable from "~/components/basic/table/ServiceTokenTable.tsx";
import NavHeader from "~/components/navigation/NavHeader";
import { getTranslatedServerSideProps } from "~/utilities/withTranslateProps";

import getServiceTokens from "../../api/serviceToken/getServiceTokens";
import deleteWorkspace from "../../api/workspace/deleteWorkspace";
import getWorkspaces from "../../api/workspace/getWorkspaces";
import renameWorkspace from "../../api/workspace/renameWorkspace";


export default function SettingsBasic() {
  const [buttonReady, setButtonReady] = useState(false);
  const router = useRouter();
  const [workspaceName, setWorkspaceName] = useState("");
  const [serviceTokens, setServiceTokens] = useState([]);
  const [workspaceToBeDeletedName, setWorkspaceToBeDeletedName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  let [isAddServiceTokenDialogOpen, setIsAddServiceTokenDialogOpen] =
    useState(false);
  const [projectIdCopied, setProjectIdCopied] = useState(false);

  const { t } = useTranslation();

  /**
   * This function copies the project id to the clipboard
   */
  function copyToClipboard() {
    // const copyText = document.getElementById('myInput') as HTMLInputElement;
    const copyText = document.getElementById('myInput')
    
    if (copyText) {
      copyText.select();
      copyText.setSelectionRange(0, 99999); // For mobile devices

      navigator.clipboard.writeText(copyText.value);
  
      setProjectIdCopied(true);
      setTimeout(() => setProjectIdCopied(false), 2000);
    }
  }

  useEffect(async () => {
    let userWorkspaces = await getWorkspaces();
    userWorkspaces.map((userWorkspace) => {
      if (userWorkspace._id == router.query.id) {
        setWorkspaceName(userWorkspace.name);
      }
    });
    let tempServiceTokens = await getServiceTokens({
      workspaceId: router.query.id,
    });
    setServiceTokens(tempServiceTokens);
  }, []);

  const modifyWorkspaceName = (newName) => {
    setButtonReady(true);
    setWorkspaceName(newName);
  };

  const submitChanges = (newWorkspaceName) => {
    renameWorkspace(router.query.id, newWorkspaceName);
    setButtonReady(false);
  };

  useEffect(async () => {
    setWorkspaceId(router.query.id);
  }, []);

  function closeAddModal() {
    setIsAddOpen(false);
  }

  function openAddModal() {
    setIsAddOpen(true);
  }

  const closeAddServiceTokenModal = () => {
    setIsAddServiceTokenDialogOpen(false);
  };

  /**
   * This function deleted a workspace.
   * It first checks if there is more than one workspace aviable. Otherwise, it doesn't delete
   * It then checks if the name of the workspace to be deleted is correct. Otherwise, it doesn't delete.
   * It then deletes the workspace and forwards the user to another aviable workspace.
   */
  const executeDeletingWorkspace = async () => {
    let userWorkspaces = await getWorkspaces();

    if (userWorkspaces.length > 1) {
      if (
        userWorkspaces.filter(
          (workspace) => workspace._id == router.query.id
        )[0].name == workspaceToBeDeletedName
      ) {
        await deleteWorkspace(router.query.id);
        let userWorkspaces = await getWorkspaces();
        router.push("/dashboard/" + userWorkspaces[0]._id);
      }
    }
  };

  return (
    <div className="bg-bunker-800 max-h-screen flex flex-col justify-between text-white">
      <Head>
        <title>
          {t("common:head-title", { title: t("settings-project:title") })}
        </title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <AddServiceTokenDialog
        isOpen={isAddServiceTokenDialogOpen}
        workspaceId={router.query.id}
        closeModal={closeAddServiceTokenModal}
        workspaceName={workspaceName}
        serviceTokens={serviceTokens}
        setServiceTokens={setServiceTokens}
      />
      <div className="flex flex-row mr-6 max-w-5xl">
        <div className="w-full max-h-screen pb-2 overflow-y-auto">
          <NavHeader
            pageName={t("settings-project:title")}
            isProjectRelated={true}
          />
          <div className="flex flex-row justify-between items-center ml-6 my-8 text-xl max-w-5xl">
            <div className="flex flex-col justify-start items-start text-3xl">
              <p className="font-semibold mr-4 text-gray-200">
                {t("settings-project:title")}
              </p>
              <p className="font-normal mr-4 text-gray-400 text-base">
                {t("settings-project:description")}
              </p>
            </div>
          </div>
          <div className="flex flex-col ml-6 text-mineshaft-50">
            <div className="flex flex-col">
              <div className="min-w-md mt-2 flex flex-col items-start">
                <div className="bg-white/5 rounded-md px-6 pt-6 pb-4 flex flex-col items-start flex flex-col items-start w-full mb-6 pt-2">
                  <p className="text-xl font-semibold mb-4 mt-2">
                    {t("common:display-name")}
                  </p>
                  <div className="max-h-28 w-full max-w-md mr-auto">
                    <InputField
                      onChangeHandler={modifyWorkspaceName}
                      type="varName"
                      value={workspaceName}
                      placeholder=""
                      isRequired
                    />
                  </div>
                  <div className="flex justify-start w-full">
                    <div className={`flex justify-start max-w-sm mt-4 mb-2`}>
                      <Button
                        text={t("common:save-changes")}
                        onButtonPressed={() => submitChanges(workspaceName)}
                        color="mineshaft"
                        size="md"
                        active={buttonReady}
                        iconDisabled={faCheck}
                        textDisabled="Saved"
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-white/5 rounded-md px-6 pt-4 pb-2 flex flex-col items-start flex flex-col items-start w-full mb-6 mt-4">
                  <p className="text-xl font-semibold self-start">
                    {t("common:project-id")}
                  </p>
                  <p className="text-base text-gray-400 font-normal self-start mt-4">
                    {t("settings-project:project-id-description")}
                  </p>
                  <p className="text-base text-gray-400 font-normal self-start">
                    {t("settings-project:project-id-description2")}
                    {/* eslint-disable-next-line react/jsx-no-target-blank */}
                    <a
                      href="https://infisical.com/docs/getting-started/introduction"
                      target="_blank"
                      rel="noopener"
                      className="text-primary hover:opacity-80 duration-200"
                    >
                      {t("settings-project:docs")}
                    </a>
                  </p>
                  <p className="mt-4 text-xs text-bunker-300">{t("settings-project:auto-generated")}</p>
                  <div className="flex justify-end items-center bg-white/[0.07] text-base mt-2 mb-3 mr-2 rounded-md text-gray-400">
                    <p className="mr-2 font-bold pl-4">{`${t(
                      "common:project-id"
                    )}:`}</p>
                    <input
                      type="text"
                      value={workspaceId}
                      id="myInput"
                      className="bg-white/0 text-gray-400 py-2 w-60 px-2 min-w-md outline-none"
                      disabled
                    ></input>
                    <div className="group font-normal group relative inline-block text-gray-400 underline hover:text-primary duration-200">
                      <button
                        onClick={copyToClipboard}
                        className="pl-4 pr-4 border-l border-white/20 py-2 hover:bg-white/[0.12] duration-200"
                      >
                        {projectIdCopied ? (
                          <FontAwesomeIcon icon={faCheck} className="pr-0.5" />
                        ) : (
                          <FontAwesomeIcon icon={faCopy} />
                        )}
                      </button>
                      <span className="absolute hidden group-hover:flex group-hover:animate-popup duration-300 w-28 -left-8 -top-20 translate-y-full pl-3 py-2 bg-bunker-800 rounded-md text-center text-gray-400 text-sm">
                        {t("common:click-to-copy")}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="bg-white/5 rounded-md px-6 pt-4 flex flex-col items-start flex flex-col items-start w-full mt-4 mb-4 pt-2">
                  <div className="flex flex-row justify-between w-full">
                    <div className="flex flex-col w-full">
                      <p className="text-xl font-semibold mb-3">
                        {t("section-token:service-tokens")}
                      </p>
                      <p className="text-base text-gray-400 mb-4">
                        {t("section-token:service-tokens-description")}
                      </p>
                    </div>
                    <div className="w-48">
                      <Button
                        text={t("section-token:add-new")}
                        onButtonPressed={() => {
                          setIsAddServiceTokenDialogOpen(true);
                        }}
                        color="mineshaft"
                        icon={faPlus}
                        size="md"
                      />
                    </div>
                  </div>
                  <ServiceTokenTable
                    data={serviceTokens}
                    workspaceName={workspaceName}
                    setServiceTokens={setServiceTokens}
                  />
                </div>
              </div>
            </div>
            <div className="bg-white/5 rounded-md px-6 pt-4 pb-6 border-l border-red pl-6 flex flex-col items-start flex flex-col items-start w-full mb-6 mt-4 pb-4 pt-2">
              <p className="text-xl font-bold text-red">
                {t("settings-project:danger-zone")}
              </p>
              <p className="mt-2 text-md text-gray-400">
                {t("settings-project:danger-zone-note")}
              </p>
              <div className="max-h-28 w-full max-w-md mr-auto mt-4">
                <InputField
                  label={t("settings-project:project-to-delete")}
                  onChangeHandler={setWorkspaceToBeDeletedName}
                  type="varName"
                  value={workspaceToBeDeletedName}
                  placeholder=""
                  isRequired
                />
              </div>
              <button
                type="button"
                className="max-w-md mt-6 w-full inline-flex justify-center rounded-md border border-transparent bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-400 hover:bg-red hover:text-white hover:font-semibold hover:text-semibold duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                onClick={executeDeletingWorkspace}
              >
                {t("settings-project:delete-project")}
              </button>
              <p className="mt-0.5 ml-1 text-xs text-gray-500">
                {t("settings-project:delete-project-note")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

SettingsBasic.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps([
  "settings",
  "settings-project",
  "section-token",
]);
