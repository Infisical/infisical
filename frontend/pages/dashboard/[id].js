import React, { Fragment, useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import {
  faArrowDownAZ,
  faArrowDownZA,
  faCheck,
  faCircleInfo,
  faCopy,
  faDownload,
  faEllipsis,
  faEye,
  faEyeSlash,
  faFolderOpen,
  faMagnifyingGlass,
  faPeopleGroup,
  faPerson,
  faPlus,
  faShuffle,
  faX
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Menu, Transition } from '@headlessui/react';

import Button from '~/components/basic/buttons/Button';
import ListBox from '~/components/basic/Listbox';
import BottonRightPopup from '~/components/basic/popups/BottomRightPopup';
import { useNotificationContext } from '~/components/context/Notifications/NotificationProvider';
import DashboardInputField from '~/components/dashboard/DashboardInputField';
import DropZone from '~/components/dashboard/DropZone';
import NavHeader from '~/components/navigation/NavHeader';
import getSecretsForProject from '~/components/utilities/secrets/getSecretsForProject';
import pushKeys from '~/components/utilities/secrets/pushKeys';
import pushKeysIntegration from '~/components/utilities/secrets/pushKeysIntegration';
import guidGenerator from '~/utilities/randomId';

import { envMapping } from '../../public/data/frequentConstants';
import getWorkspaceIntegrations from '../api/integrations/getWorkspaceIntegrations';
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
  duplicates
}) => {
  const [randomStringLength, setRandomStringLength] = useState(32);

  return (
    <div className="px-1 flex flex-col items-center ml-1">
      <div className="relative flex flex-row justify-between w-full max-w-5xl mr-auto max-h-14 my-1 items-start px-2">
        <div className="min-w-xl w-96">
          <div className="flex items-center md:px-1 rounded-lg mt-4 md:mt-0 max-h-16">
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
            />
          </div>
        </div>
        <Menu as="div" className="relative inline-block text-left">
          <div>
            <Menu.Button className="inline-flex w-full justify-center rounded-md text-sm font-medium text-gray-200 rounded-md hover:bg-white/10 duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75">
              <div className="cursor-pointer w-9 h-9 bg-white/10 rounded-md flex flex-row justify-center items-center opacity-50 hover:opacity-100 duration-200">
                <FontAwesomeIcon
                  className="text-gray-300 px-2.5 text-lg mt-0.5"
                  icon={faEllipsis}
                />
              </div>
            </Menu.Button>
          </div>
          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items className="absolute z-50 drop-shadow-xl right-0 mt-0.5 w-[20rem] origin-top-right rounded-md bg-bunker border border-mineshaft-500 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none px-1 py-1">
              <div
                onClick={() =>
                  modifyVisibility(
                    keyPair.type == 'personal' ? 'shared' : 'personal',
                    keyPair.pos
                  )
                }
                className="relative flex justify-start items-center cursor-pointer select-none py-2 px-2 rounded-md text-gray-400 hover:bg-white/10 duration-200 hover:text-gray-200 w-full"
              >
                <FontAwesomeIcon
                  className="text-lg pl-1.5 pr-3"
                  icon={keyPair.type == 'personal' ? faPeopleGroup : faPerson}
                />
                <div className="text-sm">
                  {keyPair.type == 'personal' ? 'Make Shared' : 'Make Personal'}
                </div>
              </div>
              <div
                onClick={() => {
                  if (randomStringLength > 32) {
                    setRandomStringLength(32);
                  } else if (randomStringLength < 2) {
                    setRandomStringLength(2);
                  } else {
                    modifyValue(
                      [...Array(randomStringLength)]
                        .map(() => Math.floor(Math.random() * 16).toString(16))
                        .join(''),
                      keyPair.pos
                    );
                  }
                }}
                className="relative flex flex-row justify-start items-center cursor-pointer select-none py-2 px-2 rounded-md text-gray-400 hover:bg-white/10 duration-200 hover:text-gray-200 w-full"
              >
                <FontAwesomeIcon
                  className="text-lg pl-1.5 pr-3"
                  icon={keyPair.value == '' ? faPlus : faShuffle}
                />
                <div className="text-sm justify-between flex flex-row w-full">
                  <p>Generate Random Hex</p>
                  <p>digits</p>
                </div>
              </div>
              <div className="flex flex-row absolute bottom-[0.4rem] right-[3.3rem] w-16 bg-bunker-800 border border-chicago-700 rounded-md text-bunker-200 ">
                <div
                  className="m-0.5 px-1 cursor-pointer rounded-md hover:bg-chicago-700"
                  onClick={() => {
                    if (randomStringLength > 1) {
                      setRandomStringLength(randomStringLength - 1);
                    }
                  }}
                >
                  -
                </div>
                <input
                  onChange={(e) =>
                    setRandomStringLength(parseInt(e.target.value))
                  }
                  value={randomStringLength}
                  className="text-center z-20 peer text-sm bg-transparent w-full outline-none"
                  spellCheck="false"
                />
                <div
                  className="m-0.5 px-1 pb-0.5 cursor-pointer rounded-md hover:bg-chicago-700"
                  onClick={() => {
                    if (randomStringLength < 32) {
                      setRandomStringLength(randomStringLength + 1);
                    }
                  }}
                >
                  +
                </div>
              </div>
            </Menu.Items>
          </Transition>
        </Menu>
        <div className="w-2"></div>
        <div className="opacity-50 hover:opacity-100 duration-200">
          <Button
            onButtonPressed={() => deleteRow(keyPair.id)}
            color="red"
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

    sortValuesHandler(dataToReorder);
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

  const deleteRow = (id) => {
    setButtonReady(true);
    setData(data.filter((row) => row.id !== id));
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

    /**
     * Check which integrations are active for this project and environment
     * If there are any, update environment variables for those integrations
     */
    let integrations = await getWorkspaceIntegrations({
      workspaceId: router.query.id
    });
    integrations.map(async (integration) => {
      if (
        envMapping[env] == integration.environment &&
        integration.isActive == true
      ) {
        let objIntegration = Object.assign(
          {},
          ...data.map((row) => ({ [row.key]: row.value }))
        );
        await pushKeysIntegration({
          obj: objIntegration,
          integrationId: integration._id
        });
      }
    });

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

  const sortValuesHandler = (dataToSort) => {
    const sortedData = (dataToSort != 1 ? dataToSort : data)
      .sort((a, b) =>
        sortMethod == 'alphabetical'
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
                  <div className="rounded-t-md sticky top-0 z-20 bg-bunker flex flex-row pl-4 pr-6 pt-4 pb-2 items-center justify-between text-gray-300 font-bold">
                    {/* <FontAwesomeIcon icon={faAngleDown} /> */}
                    <div className="flex flex-row items-center">
                      <p className="pl-2 text-lg">Personal</p>
                      <div className="group font-normal group relative inline-block text-gray-300 underline hover:text-primary duration-200">
                        <FontAwesomeIcon
                          className="ml-3 mt-1 text-lg"
                          icon={faCircleInfo}
                        />
                        <span className="absolute hidden group-hover:flex group-hover:animate-popdown duration-300 w-44 -left-16 -top-7 translate-y-full px-2 py-2 bg-gray-700 rounded-md text-center text-gray-100 text-sm after:content-[''] after:absolute after:left-1/2 after:bottom-[100%] after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-t-transparent after:border-b-gray-700">
                          Personal keys are only visible to you
                        </span>
                      </div>
                    </div>
                  </div>
                  <div id="data1" className="">
                    {data
                      .filter(
                        (keyPair) =>
                          keyPair.key
                            .toLowerCase()
                            .includes(searchKeys.toLowerCase()) &&
                          keyPair.type == 'personal'
                      )
                      ?.map((keyPair) => (
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
                        />
                      ))}
                  </div>
                </div>
                <div
                  className={`bg-white/5 mt-1 mb-2 rounded-md p-1 pb-2 max-w-5xl ${
                    data?.length > 8 ? 'h-3/4' : 'h-min'
                  }`}
                >
                  <div className="sticky top-0 z-40 bg-bunker flex flex-row pl-4 pr-5 pt-4 pb-2 items-center justify-between text-gray-300 font-bold">
                    {/* <FontAwesomeIcon icon={faAngleDown} /> */}
                    <div className="flex flex-row items-center">
                      <p className="pl-2 text-lg">Shared</p>
                      <div className="group font-normal group relative inline-block text-gray-300 underline hover:text-primary duration-200">
                        <FontAwesomeIcon
                          className="ml-3 text-lg mt-1"
                          icon={faCircleInfo}
                        />
                        <span className="absolute hidden group-hover:flex group-hover:animate-popdown duration-300 w-44 -left-16 -top-7 translate-y-full px-2 py-2 bg-gray-700 rounded-md text-center text-gray-100 text-sm after:content-[''] after:absolute after:left-1/2 after:bottom-[100%] after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-t-transparent after:border-b-gray-700">
                          Shared keys are visible to your whole team
                        </span>
                      </div>
                    </div>
                  </div>
                  <div id="data2" className="data2">
                    {data
                      .filter(
                        (keyPair) =>
                          keyPair.key
                            .toLowerCase()
                            .includes(searchKeys.toLowerCase()) &&
                          keyPair.type == 'shared'
                      )
                      ?.map((keyPair) => (
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
