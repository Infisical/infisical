import { Fragment, useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import {
  faArrowDownAZ,
  faArrowDownZA,
  faArrowLeft,
  faCheck,
  faClockRotateLeft,
  faEye,
  faEyeSlash,
  faFolderOpen,
  faMagnifyingGlass,
  faPlus,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import getProjectSercetSnapshotsCount from 'ee/api/secrets/GetProjectSercetSnapshotsCount';
import performSecretRollback from 'ee/api/secrets/PerformSecretRollback';
import PITRecoverySidebar from 'ee/components/PITRecoverySidebar';

import Button from '~/components/basic/buttons/Button';
import ListBox from '~/components/basic/Listbox';
import BottonRightPopup from '~/components/basic/popups/BottomRightPopup';
import { useNotificationContext } from '~/components/context/Notifications/NotificationProvider';
import DownloadSecretMenu from '~/components/dashboard/DownloadSecretsMenu';
import DropZone from '~/components/dashboard/DropZone';
import KeyPair from '~/components/dashboard/KeyPair';
import SideBar from '~/components/dashboard/SideBar';
import NavHeader from '~/components/navigation/NavHeader';
import encryptSecrets from '~/components/utilities/secrets/encryptSecrets';
import getSecretsForProject from '~/components/utilities/secrets/getSecretsForProject';
import { getTranslatedServerSideProps } from '~/components/utilities/withTranslateProps';
import guidGenerator from '~/utilities/randomId';

import addSecrets from '../api/files/AddSecrets';
import deleteSecrets from '../api/files/DeleteSecrets';
import updateSecrets from '../api/files/UpdateSecrets';
import getUser from '../api/user/getUser';
import checkUserAction from '../api/userActions/checkUserAction';
import registerUserAction from '../api/userActions/registerUserAction';
import getWorkspaces from '../api/workspace/getWorkspaces';

type WorkspaceEnv = {
  name: string;
  slug: string;
};

interface SecretDataProps {
  pos: number;
  key: string;
  value: string;
  valueOverride: string | undefined;
  id: string;
  idOverride: string | undefined;
  comment: string;
}

interface overrideProps {
  id: string;
  keyName: string;
  value: string;
  pos: number;
  comment: string;
}

interface SnapshotProps {
  id: string;
  createdAt: string;
  version: number;
  secretVersions: {
    id: string;
    pos: number;
    environment: string;
    key: string;
    value: string;
    valueOverride: string;
    comment: string;
  }[];
}

/**
 * this function finds the teh duplicates in an array
 * @param arr - array of anything (e.g., with secret keys and types (personal/shared))
 * @returns - a list with duplicates
 */
function findDuplicates(arr: any[]) {
  const map = new Map();
  return arr.filter((item) => {
    if (map.has(item)) {
      map.set(item, false);
      return true;
    } else {
      map.set(item, true);
      return false;
    }
  });
}

/**
 * This is the main component for the dashboard (aka the screen with all the encironemnt variable & secrets)
 * @returns
 */
export default function Dashboard() {
  const [data, setData] = useState<SecretDataProps[] | null>();
  const [initialData, setInitialData] = useState<SecretDataProps[] | null | undefined>([]); 
  const [buttonReady, setButtonReady] = useState(false);
  const router = useRouter();
  const [blurred, setBlurred] = useState(true);
  const [isKeyAvailable, setIsKeyAvailable] = useState(true);
  const [isNew, setIsNew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchKeys, setSearchKeys] = useState('');
  const [errorDragAndDrop, setErrorDragAndDrop] = useState(false);
  const [sortMethod, setSortMethod] = useState('alphabetical');
  const [checkDocsPopUpVisible, setCheckDocsPopUpVisible] = useState(false);
  const [hasUserEverPushed, setHasUserEverPushed] = useState(false);
  const [sidebarSecretId, toggleSidebar] = useState('None');
  const [PITSidebarOpen, togglePITSidebar] = useState(false);
  const [sharedToHide, setSharedToHide] = useState<string[]>([]);
  const [snapshotData, setSnapshotData] = useState<SnapshotProps>();
  const [numSnapshots, setNumSnapshots] = useState<number>();
  const [saveLoading, setSaveLoading] = useState(false);

  const { t } = useTranslation();
  const { createNotification } = useNotificationContext();

  const workspaceId = router.query.id as string;
  const [workspaceEnvs, setWorkspaceEnvs] = useState<WorkspaceEnv[]>([]);

  const [selectedSnapshotEnv, setSelectedSnapshotEnv] =
    useState<WorkspaceEnv>();
  const [selectedEnv, setSelectedEnv] = useState<WorkspaceEnv>({
    name: '',
    slug: '',
  });

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
    const handleWindowClose = (e: any) => {
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
  const reorderRows = (dataToReorder: SecretDataProps[] | 1) => {
    setSortMethod((prevSort) =>
      prevSort == 'alphabetical' ? '-alphabetical' : 'alphabetical'
    );

    sortValuesHandler(dataToReorder, undefined);
  };

  useEffect(() => {
    (async () => {
      try {
        const tempNumSnapshots = await getProjectSercetSnapshotsCount({
          workspaceId,
        });
        setNumSnapshots(tempNumSnapshots);
        const userWorkspaces = await getWorkspaces();
        const workspace = userWorkspaces.find(
          (workspace) => workspace._id === workspaceId
        );
        if (!workspace) {
          router.push('/dashboard/' + userWorkspaces?.[0]?._id);
        }

        setWorkspaceEnvs(workspace?.environments || []);
        // set env
        const env = workspace?.environments?.[0] || {
          name: 'unknown',
          slug: 'unkown',
        };
        setSelectedEnv(env);
        setSelectedSnapshotEnv(env);
        const user = await getUser();
        setIsNew(
          (Date.parse(String(new Date())) - Date.parse(user.createdAt)) /
            60000 <
            3
            ? true
            : false
        );

        const userAction = await checkUserAction({
          action: 'first_time_secrets_pushed',
        });
        setHasUserEverPushed(userAction ? true : false);
      } catch (error) {
        console.log('Error', error);
        setData(undefined);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        setBlurred(true);
        // ENV
        const dataToSort = await getSecretsForProject({
          env: selectedEnv.slug,
          setIsKeyAvailable,
          setData,
          workspaceId,
        });
        setInitialData(dataToSort);
        reorderRows(dataToSort);

        setTimeout(
          () => setIsLoading(false)
        , 700);
      } catch (error) {
        console.log('Error', error);
        setData(undefined);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEnv]);

  const addRow = () => {
    setIsNew(false);
    setData([
      ...data!,
      {
        id: guidGenerator(),
        idOverride: guidGenerator(),
        pos: data!.length,
        key: '',
        value: '',
        valueOverride: undefined,
        comment: '',
      },
    ]);
  };


  const deleteRow = ({ ids, secretName }: { ids: string[]; secretName: string; }) => {
    setButtonReady(true);
    toggleSidebar('None');
    createNotification({
      text: `${secretName} has been deleted. Remember to save changes.`,
      type: 'error',
    });
    sortValuesHandler(
      data!.filter((row: SecretDataProps) => !ids.includes(row.id)),
      sortMethod == 'alhpabetical' ? '-alphabetical' : 'alphabetical'
    );
  };

  const modifyValue = (value: string, pos: number) => {
    setData((oldData) => {
      oldData![pos].value = value;
      return [...oldData!];
    });
    setButtonReady(true);
  };

  const modifyValueOverride = (value: string | undefined, pos: number) => {
    setData((oldData) => {
      oldData![pos].valueOverride = value;
      return [...oldData!];
    });
    setButtonReady(true);
  };

  const modifyKey = (value: string, pos: number) => {
    setData((oldData) => {
      oldData![pos].key = value;
      return [...oldData!];
    });
    setButtonReady(true);
  };

  const modifyComment = (value: string, pos: number) => {
    setData((oldData) => {
      oldData![pos].comment = value;
      return [...oldData!];
    });
    setButtonReady(true);
  };

  // For speed purposes and better perforamance, we are using useCallback
  const listenChangeValue = useCallback((value: string, pos: number) => {
    modifyValue(value, pos);
  }, []);

  const listenChangeValueOverride = useCallback((value: string | undefined, pos: number) => {
    modifyValueOverride(value, pos);
  }, []);

  const listenChangeKey = useCallback((value: string, pos: number) => {
    modifyKey(value, pos);
  }, []);

  const listenChangeComment = useCallback((value: string, pos: number) => {
    modifyComment(value, pos);
  }, []);

  /**
   * Save the changes of environment variables and push them to the database
   */
  const savePush = async (dataToPush?: SecretDataProps[]) => {
    setSaveLoading(true);
    let newData: SecretDataProps[] | null | undefined;
    // dataToPush is mostly used for rollbacks, otherwise we always take the current state data
    if ((dataToPush ?? [])?.length > 0) {
      newData = dataToPush;
    } else {
      newData = data;
    }

    // Checking if any of the secret keys start with a number - if so, don't do anything
    const nameErrors = !newData!
      .map((secret) => !isNaN(Number(secret.key.charAt(0))))
      .every((v) => v === false);
    const duplicatesExist = findDuplicates(data!.map((item: SecretDataProps) => item.key)).length > 0;

    if (nameErrors) {
      return createNotification({
        text: 'Solve all name errors before saving secrets.',
        type: 'error',
      });
    }

    if (duplicatesExist) {
      return createNotification({
        text: 'Remove duplicated secret names before saving.',
        type: 'error',
      });
    }

    // Once "Save changes" is clicked, disable that button
    setButtonReady(false);

    const secretsToBeDeleted 
      = initialData!
      .filter(initDataPoint => !newData!.map(newDataPoint => newDataPoint.id).includes(initDataPoint.id))
      .map(secret => secret.id);
    console.log('delete', secretsToBeDeleted.length)

    const secretsToBeAdded 
      = newData!
      .filter(newDataPoint => !initialData!.map(initDataPoint => initDataPoint.id).includes(newDataPoint.id));
    console.log('add', secretsToBeAdded.length)

    const secretsToBeUpdated 
      = newData!.filter(newDataPoint => initialData!
      .filter(initDataPoint => newData!.map(newDataPoint => newDataPoint.id).includes(initDataPoint.id) 
        && (newData!.filter(newDataPoint => newDataPoint.id == initDataPoint.id)[0].value != initDataPoint.value
        || newData!.filter(newDataPoint => newDataPoint.id == initDataPoint.id)[0].key != initDataPoint.key
        || newData!.filter(newDataPoint => newDataPoint.id == initDataPoint.id)[0].comment != initDataPoint.comment))
      .map(secret => secret.id).includes(newDataPoint.id));
    console.log('update', secretsToBeUpdated.length)

    const newOverrides = newData!.filter(newDataPoint => newDataPoint.valueOverride != undefined)
    const initOverrides = initialData!.filter(initDataPoint => initDataPoint.valueOverride != undefined)

    const overridesToBeDeleted 
      = initOverrides
      .filter(initDataPoint => !newOverrides!.map(newDataPoint => newDataPoint.id).includes(initDataPoint.id))
      .map(secret => String(secret.idOverride));
    console.log('override delete', overridesToBeDeleted.length)

    const overridesToBeAdded 
      = newOverrides!
      .filter(newDataPoint => !initOverrides.map(initDataPoint => initDataPoint.id).includes(newDataPoint.id))
      .map(override => ({pos: override.pos, key: override.key, value: String(override.valueOverride), valueOverride: override.valueOverride, comment: '', id: String(override.idOverride), idOverride: String(override.idOverride)}));
    console.log('override add', overridesToBeAdded.length)

    const overridesToBeUpdated 
      = newOverrides!.filter(newDataPoint => initOverrides
      .filter(initDataPoint => newOverrides!.map(newDataPoint => newDataPoint.id).includes(initDataPoint.id) 
        && (newOverrides!.filter(newDataPoint => newDataPoint.id == initDataPoint.id)[0].valueOverride != initDataPoint.valueOverride
        || newOverrides!.filter(newDataPoint => newDataPoint.id == initDataPoint.id)[0].key != initDataPoint.key
        || newOverrides!.filter(newDataPoint => newDataPoint.id == initDataPoint.id)[0].comment != initDataPoint.comment))
      .map(secret => secret.id).includes(newDataPoint.id))
      .map(override => ({pos: override.pos, key: override.key, value: String(override.valueOverride), valueOverride: override.valueOverride, comment: '', id: String(override.idOverride), idOverride: String(override.idOverride)}));
    console.log('override update', overridesToBeUpdated.length)
    
    if (secretsToBeDeleted.concat(overridesToBeDeleted).length > 0) {
      await deleteSecrets({ secretIds: secretsToBeDeleted.concat(overridesToBeDeleted) });
    }
    if (secretsToBeAdded.concat(overridesToBeAdded).length > 0) {
      const secrets = await encryptSecrets({ secretsToEncrypt: secretsToBeAdded.concat(overridesToBeAdded), workspaceId, env: selectedEnv.slug });
      secrets && await addSecrets({ secrets, env: selectedEnv.slug, workspaceId });
    }
    if (secretsToBeUpdated.concat(overridesToBeUpdated).length > 0) {
      const secrets = await encryptSecrets({ secretsToEncrypt: secretsToBeUpdated.concat(overridesToBeUpdated), workspaceId, env: selectedEnv.slug });
      secrets && await updateSecrets({ secrets });
    }

    setInitialData(newData);

    // If this user has never saved environment variables before, show them a prompt to read docs
    if (!hasUserEverPushed) {
      setCheckDocsPopUpVisible(true);
      await registerUserAction({ action: 'first_time_secrets_pushed' });
    }

    // increasing the number of project commits
    setNumSnapshots((numSnapshots ?? 0) + 1);
    setSaveLoading(false);
  };

  const addData = (newData: SecretDataProps[]) => {
    setData(data!.concat(newData));
    setButtonReady(true);
  };

  const changeBlurred = () => {
    setBlurred(!blurred);
  };

  const sortValuesHandler = (
    dataToSort: SecretDataProps[] | 1,
    specificSortMethod?: 'alphabetical' | '-alphabetical'
  ) => {
    const howToSort =
      specificSortMethod == undefined ? sortMethod : specificSortMethod;
    const sortedData = (dataToSort != 1 ? dataToSort : data)!
      .sort((a, b) =>
        howToSort == 'alphabetical'
          ? a.key.localeCompare(b.key)
          : b.key.localeCompare(a.key)
      )
      .map((item: SecretDataProps, index: number) => {
        return {
          ...item,
          pos: index,
        };
      });

    setData(sortedData);
  };

  const deleteCertainRow = ({
    ids,
    secretName,
  }: {
    ids: string[];
    secretName: string;
  }) => {
    deleteRow({ ids, secretName });
  };

  return data ? (
    <div className='bg-bunker-800 max-h-screen flex flex-col justify-between text-white'>
      <Head>
        <title>{t('common:head-title', { title: t('dashboard:title') })}</title>
        <link rel='icon' href='/infisical.ico' />
        <meta property='og:image' content='/images/message.png' />
        <meta property='og:title' content={String(t('dashboard:og-title'))} />
        <meta
          name='og:description'
          content={String(t('dashboard:og-description'))}
        />
      </Head>
      <div className="flex flex-row">
        {sidebarSecretId != "None" && <SideBar 
          toggleSidebar={toggleSidebar} 
          data={data.filter((row: SecretDataProps) => row.key == data.filter(row => row.id == sidebarSecretId)[0]?.key)} 
          modifyKey={listenChangeKey} 
          modifyValue={listenChangeValue} 
          modifyValueOverride={listenChangeValueOverride}
          modifyComment={listenChangeComment}
          buttonReady={buttonReady}
          savePush={savePush}
          sharedToHide={sharedToHide}
          setSharedToHide={setSharedToHide}
          deleteRow={deleteCertainRow}
        />}
        {PITSidebarOpen && <PITRecoverySidebar 
          toggleSidebar={togglePITSidebar} 
          chosenSnapshot={String(snapshotData?.id ? snapshotData.id : "")}
          setSnapshotData={setSnapshotData}
        />}
        <div className="w-full max-h-96 pb-2">
          <NavHeader pageName={t("dashboard:title")} isProjectRelated={true} />
          {checkDocsPopUpVisible && (
            <BottonRightPopup
              buttonText={t('dashboard:check-docs.button')}
              buttonLink='https://infisical.com/docs/getting-started/introduction'
              titleText={t('dashboard:check-docs.title')}
              emoji='🎉'
              textLine1={t('dashboard:check-docs.line1')}
              textLine2={t('dashboard:check-docs.line2')}
              setCheckDocsPopUpVisible={setCheckDocsPopUpVisible}
            />
          )}
          <div className='flex flex-row justify-between items-center mx-6 mt-6 mb-3 text-xl max-w-5xl'>
            {snapshotData && (
              <div className={`flex justify-start max-w-sm mt-1 mr-2`}>
                <Button
                  text={String(t('Go back to current'))}
                  onButtonPressed={() => setSnapshotData(undefined)}
                  color='mineshaft'
                  size='md'
                  icon={faArrowLeft}
                />
              </div>
            )}
            <div className='flex flex-row justify-start items-center text-3xl'>
              <div className='font-semibold mr-4 mt-1 flex flex-row items-center'>
                <p>{snapshotData ? 'Secret Snapshot' : t('dashboard:title')}</p>
                {snapshotData && (
                  <span className='bg-primary-800 text-sm ml-4 mt-1 px-1.5 rounded-md'>
                    {new Date(snapshotData.createdAt).toLocaleString()}
                  </span>
                )}
              </div>
              {!snapshotData && data?.length == 0 && (
                <ListBox
                  selected={selectedEnv.name}
                  data={workspaceEnvs.map(({ name }) => name)}
                  onChange={(envName) =>
                    setSelectedEnv(
                      workspaceEnvs.find(({ name }) => envName === name) || {
                        name: 'unknown',
                        slug: 'unknown',
                      }
                    )
                  }
                />
              )}
            </div>
            <div className='flex flex-row'>
              <div className={`flex justify-start max-w-sm mt-1 mr-2`}>
                <Button
                  text={String(numSnapshots + ' ' + t('Commits'))}
                  onButtonPressed={() => togglePITSidebar(true)}
                  color='mineshaft'
                  size='md'
                  icon={faClockRotateLeft}
                />
              </div>
              {(data?.length !== 0 || buttonReady) && !snapshotData && (
                <div className={`flex justify-start max-w-sm mt-1`}>
                  <Button
                    text={String(t('common:save-changes'))}
                    onButtonPressed={savePush}
                    color='primary'
                    size='md'
                    active={buttonReady}
                    iconDisabled={faCheck}
                    textDisabled={String(t("common:saved"))}
                    loading={saveLoading}
                  />
                </div>
              )}
              {snapshotData && <div className={`flex justify-start max-w-sm mt-1`}>
                <Button
                  text={String(t("Rollback to this snapshot"))}
                  onButtonPressed={async () => {
                    // Update secrets in the state only for the current environment
                    const rolledBackSecrets = snapshotData.secretVersions
                    .filter(row => row.environment == selectedEnv.slug)
                    .map((sv, position) => { 
                      return {
                        id: sv.id, idOverride: sv.id, pos: position, valueOverride: sv.valueOverride, key: sv.key, value: sv.value, comment: ''
                      }
                    });
                    setData(rolledBackSecrets);

                    // Perform the rollback globally
                    performSecretRollback({ workspaceId, version: snapshotData.version })

                    setSnapshotData(undefined);
                    createNotification({
                      text: `Rollback has been performed successfully.`,
                      type: 'success'
                    });
                  }}
                  color="primary"
                  size="md"
                  active={buttonReady}
                />
              </div>}
            </div>
          </div>
          <div className='mx-6 w-full pr-12'>
            <div className='flex flex-col max-w-5xl pb-1'>
              <div className='w-full flex flex-row items-start'>
                {(snapshotData || data?.length !== 0) && (
                  <>
                    {!snapshotData ? (
                      <ListBox
                        selected={selectedEnv.name}
                        data={workspaceEnvs.map(({ name }) => name)}
                        onChange={(envName) =>
                          setSelectedEnv(
                            workspaceEnvs.find(
                              ({ name }) => envName === name
                            ) || {
                              name: 'unknown',
                              slug: 'unknown',
                            }
                          )
                        }
                      />
                    ) : (
                      <ListBox
                        selected={selectedSnapshotEnv?.name || ''}
                        data={workspaceEnvs.map(({ name }) => name)}
                        onChange={(envName) =>
                          setSelectedSnapshotEnv(
                            workspaceEnvs.find(
                              ({ name }) => envName === name
                            ) || {
                              name: 'unknown',
                              slug: 'unknown',
                            }
                          )
                        }
                      />
                    )}
                    <div className='h-10 w-full bg-white/5 hover:bg-white/10 ml-2 flex items-center rounded-md flex flex-row items-center'>
                      <FontAwesomeIcon
                        className='bg-white/5 rounded-l-md py-3 pl-4 pr-2 text-gray-400'
                        icon={faMagnifyingGlass}
                      />
                      <input
                        className='pl-2 text-gray-400 rounded-r-md bg-white/5 w-full h-full outline-none'
                        value={searchKeys}
                        onChange={(e) => setSearchKeys(e.target.value)}
                        placeholder={String(t('dashboard:search-keys'))}
                      />
                    </div>
                    {!snapshotData && (
                      <div className='ml-2 min-w-max flex flex-row items-start justify-start'>
                        <Button
                          onButtonPressed={() => reorderRows(1)}
                          color='mineshaft'
                          size='icon-md'
                          icon={
                            sortMethod == 'alphabetical'
                              ? faArrowDownAZ
                              : faArrowDownZA
                          }
                        />
                      </div>
                    )}
                    {!snapshotData && (
                      <div className='ml-2 min-w-max flex flex-row items-start justify-start'>
                        <DownloadSecretMenu
                          data={data}
                          env={selectedEnv.slug}
                        />
                      </div>
                    )}
                    <div className='ml-2 min-w-max flex flex-row items-start justify-start'>
                      <Button
                        onButtonPressed={changeBlurred}
                        color='mineshaft'
                        size='icon-md'
                        icon={blurred ? faEye : faEyeSlash}
                      />
                    </div>
                    {!snapshotData && (
                      <div className='relative ml-2 min-w-max flex flex-row items-start justify-end'>
                        <Button
                          text={String(t('dashboard:add-key'))}
                          onButtonPressed={addRow}
                          color='mineshaft'
                          icon={faPlus}
                          size='md'
                        />
                        {isNew && (
                          <span className='absolute right-0 flex h-3 w-3 items-center justify-center ml-4 mb-4'>
                            <span className='animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/50 opacity-75 h-4 w-4'></span>
                            <span className='relative inline-flex rounded-full h-3 w-3 bg-primary'></span>
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            {isLoading ? (
              <div className='flex items-center justify-center h-full my-48'>
                <Image
                  src='/images/loading/loading.gif'
                  height={60}
                  width={100}
                  alt='infisical loading indicator'
                ></Image>
              </div>
            ) : data?.length !== 0 ? (
              <div className='flex flex-col w-full mt-1 mb-2'>
                <div
                  className={`max-w-5xl mt-1 max-h-[calc(100vh-280px)] overflow-hidden overflow-y-scroll no-scrollbar no-scrollbar::-webkit-scrollbar`}
                >
                  <div className="px-1 pt-2 bg-mineshaft-800 rounded-md p-2">
                    {!snapshotData && data?.filter(row => row.key?.toUpperCase().includes(searchKeys.toUpperCase()))
                    .filter(row => !sharedToHide.includes(row.id)).map((keyPair) => (
                      <KeyPair 
                        key={keyPair.id}
                        keyPair={keyPair}
                        modifyValue={listenChangeValue}
                        modifyValueOverride={listenChangeValueOverride}
                        modifyKey={listenChangeKey}
                        isBlurred={blurred}
                        isDuplicate={findDuplicates(
                          data?.map((item) => item.key)
                        )?.includes(keyPair.key)}
                        toggleSidebar={toggleSidebar}
                        sidebarSecretId={sidebarSecretId}
                        isSnapshot={false}
                      />
                    ))}
                    {snapshotData && snapshotData.secretVersions?.sort((a, b) => a.key.localeCompare(b.key))
                    .filter(row => row.environment == selectedSnapshotEnv?.slug)
                    .filter(row => row.key.toUpperCase().includes(searchKeys.toUpperCase()))
                    .filter(
                      row => !(snapshotData.secretVersions?.filter(row => (snapshotData.secretVersions
                      ?.map((item) => item.key)
                      .filter(
                        (item, index) =>
                          index !==
                          snapshotData.secretVersions?.map((item) => item.key).indexOf(item)
                      ).includes(row.key)))?.map((item) => item.id).includes(row.id))
                    )
                    .map((keyPair) => (
                      <KeyPair 
                        key={keyPair.id}
                        keyPair={keyPair}
                        modifyValue={listenChangeValue}
                        modifyValueOverride={listenChangeValueOverride}
                        modifyKey={listenChangeKey}
                        isBlurred={blurred}
                        isDuplicate={findDuplicates(
                          data?.map((item) => item.key)
                        )?.includes(keyPair.key)}
                        toggleSidebar={toggleSidebar}
                        sidebarSecretId={sidebarSecretId}
                        isSnapshot={true}
                      />
                    ))}
                  </div>
                  {!snapshotData && (
                    <div className='w-full max-w-5xl px-2 pt-3'>
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
                  )}
                </div>
              </div>
            ) : (
              <div className='flex flex-col items-center justify-center h-full text-xl text-gray-400 max-w-5xl mt-28'>
                {isKeyAvailable && !snapshotData && (
                  <DropZone
                    setData={setData}
                    setErrorDragAndDrop={setErrorDragAndDrop}
                    createNewFile={addRow}
                    errorDragAndDrop={errorDragAndDrop}
                    setButtonReady={setButtonReady}
                    numCurrentRows={data.length}
                    keysExist={false}
                  />
                )}
                {!isKeyAvailable && (
                  <>
                    <FontAwesomeIcon
                      className='text-7xl mt-20 mb-8'
                      icon={faFolderOpen}
                    />
                    <p>
                      To view this file, contact your administrator for
                      permission.
                    </p>
                    <p className='mt-1'>
                      They need to grant you access in the team tab.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className='relative z-10 w-10/12 mr-auto h-full ml-2 bg-bunker-800 flex flex-col items-center justify-center'>
      <div className='absolute top-0 bg-bunker h-14 border-b border-mineshaft-700 w-full'></div>
      <Image
        src='/images/loading/loading.gif'
        height={70}
        width={120}
        alt='loading animation'
      ></Image>
    </div>
  );
}

Dashboard.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['dashboard']);
