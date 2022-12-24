import React, { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import {
  faArrowDownAZ,
  faArrowDownZA,
  faCheck,
  faCopy,
  faDownload,
  faEllipsis,
  faEye,
  faEyeSlash,
  faFolderOpen,
  faMagnifyingGlass,
  faPlus,
  faX
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from '~/components/basic/buttons/Button';
import ListBox from '~/components/basic/Listbox';
import BottonRightPopup from '~/components/basic/popups/BottomRightPopup';
import { useNotificationContext } from '~/components/context/Notifications/NotificationProvider';
import DashboardInputField from '~/components/dashboard/DashboardInputField';
import DropZone from '~/components/dashboard/DropZone';
import SideBar from '~/components/dashboard/Sidebar';
import NavHeader from '~/components/navigation/NavHeader';
import getSecretsForProject from '~/components/utilities/secrets/getSecretsForProject';
import pushKeys from '~/components/utilities/secrets/pushKeys';
import guidGenerator from '~/utilities/randomId';

import { envMapping } from '../../public/data/frequentConstants';
import getUser from '../api/user/getUser';
import checkUserAction from '../api/userActions/checkUserAction';
import registerUserAction from '../api/userActions/registerUserAction';
import getWorkspaces from '../api/workspace/getWorkspaces';

/**
 * This component represent a single row for an environemnt variable on the dashboard
 * @param {object} obj
 * @param {String[]} obj.keyPair - data related to the environment variable (id, pos, key, value, public/private)
 * @param {function} obj.deleteRow - a function to delete a certain keyPair
 * @param {function} obj.modifyKey - modify the key of a certain environment variable
 * @param {function} obj.modifyValue - modify the value of a certain environment variable
 * @param {function} obj.modifyVisibility - switch between public/private visibility
 * @param {boolean} obj.isBlurred - if the blurring setting is turned on
 * @param {string[]} obj.duplicates - list of all the duplicates secret names on the dashboard
 * @returns
 */
const KeyPair = ({
  keyPair,
  deleteRow,
  modifyKey,
  modifyValue,
  modifyVisibility,
  isBlurred,
  duplicates,
  toggleSidebar,
  sidebarSecretNumber
}) => {

  return (
    <div className={`mx-1 flex flex-col items-center ml-1 ${keyPair.pos == sidebarSecretNumber && "bg-mineshaft-500 duration-200"} rounded-md`}>
      <div className="relative flex flex-row justify-between w-full max-w-5xl mr-auto max-h-14 my-1 items-start px-1">
        <div className="min-w-xl w-96">
          <div className="flex pr-1 items-center rounded-lg mt-4 md:mt-0 max-h-16">
            <DashboardInputField
              onChangeHandler={modifyKey}
              type="varName"
              position={keyPair.pos}
              value={keyPair.key}
              duplicates={duplicates}
            />
          </div>
        </div>
        <div className="w-full min-w-5xl">
          <div className="flex min-w-7xl items-center pl-1 pr-1.5 rounded-lg mt-4 md:mt-0 max-h-10 ">
            <DashboardInputField
              onChangeHandler={modifyValue}
              type="value"
              position={keyPair.pos}
              value={keyPair.value}
              blurred={isBlurred}
              override={keyPair.value == "user1234" && true}
            />
          </div>
        </div>
        <div onClick={() => toggleSidebar(keyPair.pos)} className="cursor-pointer w-9 h-9 bg-mineshaft-700 hover:bg-chicago-700 rounded-md flex flex-row justify-center items-center duration-200">
          <FontAwesomeIcon
            className="text-gray-300 px-2.5 text-lg mt-0.5"
            icon={faEllipsis}
          />
        </div>
        <div className="w-2"></div>
        <div className="bg-[#9B3535] hover:bg-red rounded-md duration-200">
          <Button
            onButtonPressed={() => deleteRow(keyPair.id)}
            color="none"
            size="icon-sm"
            icon={faX}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * This is the main component for the dashboard (aka the screen with all the encironemnt variable & secrets)
 * @returns
 */
export default function Dashboard() {
  const [data, setData] = useState();
  const [fileState, setFileState] = useState([]);
  const [buttonReady, setButtonReady] = useState(false);
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState('');
  const [blurred, setBlurred] = useState(true);
  const [isKeyAvailable, setIsKeyAvailable] = useState(true);
  const [env, setEnv] = useState(
    router.asPath.split('?').length == 1
      ? 'Development'
      : Object.keys(envMapping).includes(router.asPath.split('?')[1])
      ? router.asPath.split('?')[1]
      : 'Development'
  );
  const [isNew, setIsNew] = useState(false);
  const [searchKeys, setSearchKeys] = useState('');
  const [errorDragAndDrop, setErrorDragAndDrop] = useState(false);
  const [projectIdCopied, setProjectIdCopied] = useState(false);
  const [sortMethod, setSortMethod] = useState('alphabetical');
  const [checkDocsPopUpVisible, setCheckDocsPopUpVisible] = useState(false);
  const [hasUserEverPushed, setHasUserEverPushed] = useState(false);
  const [sidebarSecretNumber, toggleSidebar] = useState(-1);

  const { createNotification } = useNotificationContext();

  // #TODO: fix save message for changing reroutes
  // const beforeRouteHandler = (url) => {
  // 	const warningText =
  // 		"Do you want to save your results bfore leaving this page?";
  // 	if (!buttonReady) return;
  // 	if (router.asPath !== url && !confirm(warningText)) {
  // 		// router.events.emit('routeChangeError');
  // 		// setData(data)
  // 		savePush();
  // 		throw `Route change to "${url}" was aborted (this error can be safely ignored).`;
  // 	} else {
  // 		setButtonReady(false);
  // 	}
  // };

  // prompt the user if they try and leave with unsaved changes
  useEffect(() => {
    const warningText =
      'Do you want to save your results before leaving this page?';
    const handleWindowClose = (e) => {
      if (!buttonReady) return;
      e.preventDefault();
      return (e.returnValue = warningText);
    };
    window.addEventListener('beforeunload', handleWindowClose);
    // router.events.on('routeChangeStart', beforeRouteHandler);
    return () => {
      window.removeEventListener('beforeunload', handleWindowClose);
      // router.events.off('routeChangeStart', beforeRouteHandler);
    };
  }, [buttonReady]);

  /**
   * Reorder rows alphabetically or in the opprosite order
   */
  const reorderRows = (dataToReorder) => {
    setSortMethod((prevSort) =>
      prevSort == 'alphabetical' ? '-alphabetical' : 'alphabetical'
    );

    sortValuesHandler(dataToReorder, "");
  };

  useEffect(() => {
    (async () => {
      try {
        let userWorkspaces = await getWorkspaces();
        const listWorkspaces = userWorkspaces.map((workspace) => workspace._id);
        if (
          !listWorkspaces.includes(router.asPath.split('/')[2].split('?')[0])
        ) {
          router.push('/dashboard/' + listWorkspaces[0]);
        }

        if (env != router.asPath.split('?')[1]) {
          router.push(router.asPath.split('?')[0] + '?' + env);
        }
        setBlurred(true);
        setWorkspaceId(router.query.id);

        const dataToSort = await getSecretsForProject({
          env,
          setFileState,
          setIsKeyAvailable,
          setData,
          workspaceId: router.query.id
        });
        reorderRows(dataToSort);

        const user = await getUser();
        setIsNew(
          (Date.parse(new Date()) - Date.parse(user.createdAt)) / 60000 < 3
            ? true
            : false
        );

        let userAction = await checkUserAction({
          action: 'first_time_secrets_pushed'
        });
        setHasUserEverPushed(userAction ? true : false);
      } catch (error) {
        console.log('Error', error);
        setData([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env]);

  const addRow = () => {
    setIsNew(false);
    setData([
      ...data,
      {
        id: guidGenerator(),
        pos: data.length,
        key: '',
        value: '',
        type: 'shared'
      }
    ]);
  };

  /**
   * This function add an ovverrided version of a certain secret to the current user
   * @param {object} obj 
   * @param {string} obj.id - if of this secret that is about to be overriden
   * @param {string} obj.keyName - key name of this secret
   * @param {string} obj.value - value of this secret
   * @param {string} obj.pos - position of this secret on the dashboard 
   */
  const addOverride = ({ id, keyName, value, pos }) => {
    setIsNew(false);
    const tempdata = [
      ...data,
      {
        id: id,
        pos: pos,
        key: keyName,
        value: value,
        type: 'personal'
      }
    ];
    sortValuesHandler(tempdata, sortMethod == "alhpabetical" ? "-alphabetical" : "alphabetical");
  };

  const deleteRow = (id) => {
    setButtonReady(true);
    setData(data.filter((row) => row.id !== id));
  };

  /**
   * This function deleted the override of a certain secrer
   * @param {string} id - id of a secret to be deleted
   */
  const deleteOverride = (id) => {
    setButtonReady(true);
    setData(data.filter((row) => !(row.id == id && row.type == 'personal')));
  };

  const modifyValue = (value, pos) => {
    setData((oldData) => {
      oldData[pos].value = value;
      return [...oldData];
    });
    setButtonReady(true);
  };

  const modifyKey = (value, pos) => {
    setData((oldData) => {
      oldData[pos].key = value;
      return [...oldData];
    });
    setButtonReady(true);
  };

  const modifyVisibility = (value, pos) => {
    setData((oldData) => {
      oldData[pos].type = value;
      return [...oldData];
    });
    setButtonReady(true);
  };

  // For speed purposes and better perforamance, we are using useCallback
  const listenChangeValue = useCallback((value, pos) => {
    modifyValue(value, pos);
  }, []);

  const listenChangeKey = useCallback((value, pos) => {
    modifyKey(value, pos);
  }, []);

  const listenChangeVisibility = useCallback((value, pos) => {
    modifyVisibility(value, pos);
  }, []);

  /**
   * Save the changes of environment variables and push them to the database
   */
  const savePush = async () => {
    // Format the new object with environment variables
    let obj = Object.assign(
      {},
      ...data.map((row) => ({ [row.key]: [row.value, row.type] }))
    );

    // Checking if any of the secret keys start with a number - if so, don't do anything
    const nameErrors = !Object.keys(obj)
      .map((key) => !isNaN(key.charAt(0)))
      .every((v) => v === false);
    const duplicatesExist =
      data
        ?.map((item) => item.key)
        .filter(
          (item, index) => index !== data?.map((item) => item.key).indexOf(item)
        ).length > 0;

    if (nameErrors) {
      return createNotification({
        text: 'Solve all name errors before saving secrets.',
        type: 'error'
      });
    }

    if (duplicatesExist) {
      return createNotification({
        text: 'Remove duplicated secret names before saving.',
        type: 'error'
      });
    }

    // Once "Save changed is clicked", disable that button
    setButtonReady(false);
    pushKeys({ obj, workspaceId: router.query.id, env });

    // If this user has never saved environment variables before, show them a prompt to read docs
    if (!hasUserEverPushed) {
      setCheckDocsPopUpVisible(true);
      await registerUserAction({ action: 'first_time_secrets_pushed' });
    }
  };

  const addData = (newData) => {
    setData(data.concat(newData));
    setButtonReady(true);
  };

  const changeBlurred = () => {
    setBlurred(!blurred);
  };

  const sortValuesHandler = (dataToSort, specificSortMethod) => {
    const howToSort = specificSortMethod != "" ? specificSortMethod : sortMethod
    const sortedData = (dataToSort != 1 ? dataToSort : data)
    .sort((a, b) =>
      howToSort == 'alphabetical'
        ? a.key.localeCompare(b.key)
        : b.key.localeCompare(a.key)
    )
    .map((item, index) => {
      return {
        ...item,
        pos: index
      };
    });

    setData(sortedData);
  };

  // This function downloads the secrets as a .env file
  const download = () => {
    const file = data
      .map((item) => [item.key, item.value].join('='))
      .join('\n');
    const blob = new Blob([file]);
    const fileDownloadUrl = URL.createObjectURL(blob);
    let alink = document.createElement('a');
    alink.href = fileDownloadUrl;
    alink.download = envMapping[env] + '.env';
    alink.click();
  };

  const deleteCertainRow = (id) => {
    deleteRow(id);
  };

  /**
   * This function copies the project id to the clipboard
   */
  function copyToClipboard() {
    var copyText = document.getElementById('myInput');

    copyText.select();
    copyText.setSelectionRange(0, 99999); // For mobile devices

    navigator.clipboard.writeText(copyText.value);

    setProjectIdCopied(true);
    setTimeout(() => setProjectIdCopied(false), 2000);
  }

  return data ? (
    <div className="bg-bunker-800 max-h-screen flex flex-col justify-between text-white">
      <Head>
        <title>Secrets</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Manage your .env files in seconds" />
        <meta
          name="og:description"
          content="Infisical a simple end-to-end encrypted platform that enables teams to sync and manage their .env files."
        />
      </Head>
      <div className="flex flex-row">
        {sidebarSecretNumber != -1 && <SideBar 
          toggleSidebar={toggleSidebar} 
          data={data.filter(row => row.pos == sidebarSecretNumber)} 
          modifyKey={listenChangeKey} 
          modifyValue={listenChangeValue} 
          modifyVisibility={listenChangeVisibility} 
          addOverride={addOverride}
          deleteOverride={deleteOverride}
        />}
        <div className="w-full max-h-96 pb-2">
          <NavHeader pageName="Secrets" isProjectRelated={true} />
          {checkDocsPopUpVisible && (
            <BottonRightPopup
              buttonText="Check Docs"
              buttonLink="https://infisical.com/docs/getting-started/introduction"
              titleText="Good job!"
              emoji="🎉"
              textLine1="Congrats on adding more secrets."
              textLine2="Here is how to connect them to your codebase."
              setCheckDocsPopUpVisible={setCheckDocsPopUpVisible}
            />
          )}
          <div className="flex flex-row justify-between items-center mx-6 mt-6 mb-3 text-xl max-w-5xl">
            <div className="flex flex-row justify-start items-center text-3xl">
              <p className="font-semibold mr-4 mt-1">Secrets</p>
              {data?.length == 0 && (
                <ListBox
                  selected={env}
                  data={['Development', 'Staging', 'Production', 'Testing']}
                  // ref={useRef(123)}
                  onChange={setEnv}
                  className="z-40"
                />
              )}
            </div>
            <div className="flex flex-row">
              <div className="flex justify-end items-center bg-white/[0.07] text-base mt-2 mr-2 rounded-md text-gray-400">
                <p className="mr-2 font-bold pl-4">Project ID:</p>
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
                  <span className="absolute hidden group-hover:flex group-hover:animate-popup duration-300 w-28 -left-8 -top-20 translate-y-full pl-3 py-2 bg-white/10 rounded-md text-center text-gray-400 text-sm">
                    Click to Copy
                  </span>
                </div>
              </div>
              {(data?.length !== 0 || buttonReady) && (
                <div className={`flex justify-start max-w-sm mt-2`}>
                  <Button
                    text="Save Changes"
                    onButtonPressed={savePush}
                    color="primary"
                    size="md"
                    active={buttonReady}
                    iconDisabled={faCheck}
                    textDisabled="Saved"
                  />
                </div>
              )}
            </div>
          </div>
          <div className="mx-6 w-full pr-12">
            <div className="flex flex-col max-w-5xl pb-1">
              <div className="w-full flex flex-row items-start">
                {data?.length !== 0 && (
                  <>
                    <ListBox
                      selected={env}
                      data={['Development', 'Staging', 'Production', 'Testing']}
                      // ref={useRef(123)}
                      onChange={setEnv}
                      className="z-40"
                    />
                    <div className="h-10 w-full bg-white/5 hover:bg-white/10 ml-2 flex items-center rounded-md flex flex-row items-center">
                      <FontAwesomeIcon
                        className="bg-white/5 rounded-l-md py-3 pl-4 pr-2 text-gray-400"
                        icon={faMagnifyingGlass}
                      />
                      <input
                        className="pl-2 text-gray-400 rounded-r-md bg-white/5 w-full h-full outline-none"
                        value={searchKeys}
                        onChange={(e) => setSearchKeys(e.target.value)}
                        placeholder={'Search keys...'}
                      />
                    </div>
                    <div className="ml-2 min-w-max flex flex-row items-start justify-start">
                      <Button
                        onButtonPressed={() => reorderRows(1)}
                        color="mineshaft"
                        size="icon-md"
                        icon={
                          sortMethod == 'alphabetical'
                            ? faArrowDownAZ
                            : faArrowDownZA
                        }
                      />
                    </div>
                    <div className="ml-2 min-w-max flex flex-row items-start justify-start">
                      <Button
                        onButtonPressed={download}
                        color="mineshaft"
                        size="icon-md"
                        icon={faDownload}
                      />
                    </div>
                    <div className="ml-2 min-w-max flex flex-row items-start justify-start">
                      <Button
                        onButtonPressed={changeBlurred}
                        color="mineshaft"
                        size="icon-md"
                        icon={blurred ? faEye : faEyeSlash}
                      />
                    </div>
                    <div className="relative ml-2 min-w-max flex flex-row items-start justify-end">
                      <Button
                        text="Add Key"
                        onButtonPressed={addRow}
                        color="mineshaft"
                        icon={faPlus}
                        size="md"
                      />
                      {isNew && (
                        <span className="absolute right-0 flex h-3 w-3 items-center justify-center ml-4 mb-4">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/50 opacity-75 h-4 w-4"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            {data?.length !== 0 ? (
              <div
                id="dataall"
                className="flex flex-col max-h-40 grow max-h-[calc(100vh-240px)] w-full overflow-y-scroll no-scrollbar no-scrollbar::-webkit-scrollbar"
              >
                <div
                  className={`bg-white/5 mt-1 mb-1 rounded-md pb-2 max-w-5xl overflow-visible`}
                >
                  <div id="data1" className="px-1 pt-2">
                    {data?.filter(row => !(data
                          ?.map((item) => item.key)
                          .filter(
                            (item, index) =>
                              index !==
                              data?.map((item) => item.key).indexOf(item)
                          ).includes(row.key) && row.type == 'shared')).map((keyPair) => (
                      <KeyPair
                        key={keyPair.id}
                        keyPair={keyPair}
                        deleteRow={deleteCertainRow}
                        modifyValue={listenChangeValue}
                        modifyKey={listenChangeKey}
                        modifyVisibility={listenChangeVisibility}
                        isBlurred={blurred}
                        duplicates={data
                          ?.map((item) => item.key)
                          .filter(
                            (item, index) =>
                              index !==
                              data?.map((item) => item.key).indexOf(item)
                          )}
                        toggleSidebar={toggleSidebar}
                        sidebarSecretNumber={sidebarSecretNumber}
                      />
                    ))}
                  </div>
                </div>
                <div className="w-full max-w-5xl">
                  <DropZone
                    setData={addData}
                    setErrorDragAndDrop={setErrorDragAndDrop}
                    createNewFile={addRow}
                    errorDragAndDrop={errorDragAndDrop}
                    setButtonReady={setButtonReady}
                    keysExist={true}
                    numCurrentRows={data.length}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-xl text-gray-400 max-w-5xl mt-28">
                {fileState.message != "There's nothing to pull" &&
                  fileState.message != undefined && (
                    <FontAwesomeIcon
                      className="text-7xl mb-8"
                      icon={faFolderOpen}
                    />
                  )}
                {(fileState.message == "There's nothing to pull" ||
                  fileState.message == undefined) &&
                  isKeyAvailable && (
                    <DropZone
                      setData={setData}
                      setErrorDragAndDrop={setErrorDragAndDrop}
                      createNewFile={addRow}
                      errorDragAndDrop={errorDragAndDrop}
                      setButtonReady={setButtonReady}
                      numCurrentRows={data.length}
                    />
                  )}
                {fileState.message ==
                  'Failed membership validation for workspace' && (
                  <p>You are not authorized to view this project.</p>
                )}
                {fileState.message == 'Access needed to pull the latest file' ||
                  (!isKeyAvailable && (
                    <>
                      <FontAwesomeIcon
                        className="text-7xl mt-20 mb-8"
                        icon={faFolderOpen}
                      />
                      <p>
                        To view this file, contact your administrator for
                        permission.
                      </p>
                      <p className="mt-1">
                        They need to grant you access in the team tab.
                      </p>
                    </>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="relative z-10 w-10/12 mr-auto h-full ml-2 bg-bunker-800 flex flex-col items-center justify-center">
      <div className="absolute top-0 bg-bunker h-14 border-b border-mineshaft-700 w-full"></div>
      <Image
        src="/images/loading/loading.gif"
        height={70}
        width={120}
        alt="loading animation"
      ></Image>
    </div>
  );
}

Dashboard.requireAuth = true;
