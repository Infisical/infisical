/* eslint-disable no-nested-ternary */
import { UIEvent, useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import {
  faArrowDown,
  faArrowLeft,
  faArrowUp,
  faCheck,
  faClockRotateLeft,
  faEye,
  faEyeSlash,
  faFolderOpen,
  faMagnifyingGlass,
  faPlus,
  faXmark
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Tag } from 'public/data/frequentInterfaces';
import queryString from 'query-string';

import Button from '@app/components/basic/buttons/Button';
import BottonRightPopup from '@app/components/basic/popups/BottomRightPopup';
import { useNotificationContext } from '@app/components/context/Notifications/NotificationProvider';
import ConfirmEnvOverwriteModal from '@app/components/dashboard/ConfirmEnvOverwriteModal';
import DownloadSecretMenu from '@app/components/dashboard/DownloadSecretsMenu';
import DropZone from '@app/components/dashboard/DropZone';
import KeyPair from '@app/components/dashboard/KeyPair';
import SideBar from '@app/components/dashboard/SideBar';
import NavHeaderSecrets from '@app/components/navigation/NavHeaderSecrets';
import { decryptAssymmetric, decryptSymmetric } from '@app/components/utilities/cryptography/crypto';
import guidGenerator from '@app/components/utilities/randomId';
import encryptSecrets from '@app/components/utilities/secrets/encryptSecrets';
import getSecretsForProject from '@app/components/utilities/secrets/getSecretsForProject';
import { getTranslatedServerSideProps } from '@app/components/utilities/withTranslateProps';
import { IconButton } from '@app/components/v2';
import { leaveConfirmDefaultMessage } from '@app/const';
import getProjectSercetSnapshotsCount from '@app/ee/api/secrets/GetProjectSercetSnapshotsCount';
import performSecretRollback from '@app/ee/api/secrets/PerformSecretRollback';
import PITRecoverySidebar from '@app/ee/components/PITRecoverySidebar';
import { useLeaveConfirm } from '@app/hooks';
// import { DashboardPage } from  '@app/views/DashboardPage';
import { DashboardEnvOverview } from '@app/views/DashboardPage/DashboardEnvOverview';

// import addSecrets from '../api/files/AddSecrets';
// import deleteSecrets from '../api/files/DeleteSecrets';
// import updateSecrets from '../api/files/UpdateSecrets';
import batchSecrets from '../api/files/batchSecrets';
import getUser from '../api/user/getUser';
import checkUserAction from '../api/userActions/checkUserAction';
import registerUserAction from '../api/userActions/registerUserAction';
import getLatestFileKey from '../api/workspace/getLatestFileKey';
import getWorkspaceEnvironments from '../api/workspace/getWorkspaceEnvironments';
import getWorkspaces from '../api/workspace/getWorkspaces';
import getWorkspaceTags from '../api/workspace/getWorkspaceTags';

type WorkspaceEnv = {
  name: string;
  slug: string;
  isWriteDenied: boolean;
  isReadDenied: boolean;
};

interface SecretDataProps {
  pos: number;
  key: string;
  value: string | undefined;
  valueOverride: string | undefined;
  id: string;
  idOverride: string | undefined;
  comment: string;
  tags: Tag[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface OverrideProps {
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
    tags: Tag[];
  }[];
}

interface EncryptedSecretProps {
  _id: string;
  createdAt: string;
  environment: string;
  secretCommentCiphertext: string;
  secretCommentIV: string;
  secretCommentTag: string;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  type: 'personal' | 'shared';
  tags: Tag[];
}

interface SecretProps {
  key: string;
  value: string | undefined;
  type: 'personal' | 'shared';
  comment: string;
  id: string;
  tags: Tag[];
}

/**
 * this function finds the the duplicates in an array
 * @param arr - array of anything (e.g., with secret keys and types (personal/shared))
 * @returns - a list with duplicates
 */
function findDuplicates(arr: any[]) {
  const map = new Map();
  return arr.filter((item) => {
    if (map.has(item)) {
      map.set(item, false);
      return true;
    }
    map.set(item, true);
    return false;
  });
}

/**
 * This is the main component for the dashboard (aka the screen with all the encironemnt variable & secrets)
 * @returns
 */
export default function Dashboard() {
  const [data, setData] = useState<SecretDataProps[] | null>();
  const [initialData, setInitialData] = useState<SecretDataProps[] | null | undefined>([]);
  const [blurred, setBlurred] = useState(true);
  const [isKeyAvailable, setIsKeyAvailable] = useState(true);
  const [isNew, setIsNew] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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
  const [autoCapitalization, setAutoCapitalization] = useState(false);
  const [dropZoneData, setDropZoneData] = useState<SecretDataProps[]>();
  const [projectTags, setProjectTags] = useState<Tag[]>([]);

  const { hasUnsavedChanges, setHasUnsavedChanges } = useLeaveConfirm({ initialValue: false });
  const { t } = useTranslation();
  
  const { createNotification } = useNotificationContext();
  const router = useRouter();
  const envInURL = queryString.parse(router.asPath.split('?')[1])?.env;

  const workspaceId = router.query.id as string;
  const [workspaceEnvs, setWorkspaceEnvs] = useState<WorkspaceEnv[]>([]);

  const [selectedSnapshotEnv, setSelectedSnapshotEnv] = useState<WorkspaceEnv>();
  const [selectedEnv, setSelectedEnv] = useState<WorkspaceEnv>();
  const [atSecretAreaTop, setAtSecretsAreaTop] = useState(true);
  const secretsTop = useRef<HTMLDivElement>(null);

  const onSecretsAreaScroll = (event: UIEvent<HTMLDivElement>) => {
    if (event.currentTarget.scrollTop !== 0) {
      setAtSecretsAreaTop(false);
    }
  };

  // TODO(akhilmhdh): change to FP
  const sortValuesHandler = (
    dataToSort: SecretDataProps[] | 1,
    specificSortMethod?: 'alphabetical' | '-alphabetical'
  ) => {
    const howToSort = specificSortMethod === undefined ? sortMethod : specificSortMethod;
    const sortedData = (dataToSort !== 1 ? dataToSort : data)!
      .sort((a, b) =>
        howToSort === 'alphabetical' ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key)
      )
      .map((item: SecretDataProps, index: number) => ({
        ...item,
        pos: index
      }));

    setData(sortedData);
    setIsLoading(false);
  };

  /**
   * Reorder rows alphabetically or in the opprosite order
   */
  const reorderRows = (dataToReorder: SecretDataProps[] | 1) => {
    if (dataToReorder) {
      setSortMethod((prevSort) => (prevSort === 'alphabetical' ? '-alphabetical' : 'alphabetical'));

      sortValuesHandler(dataToReorder, undefined);
    }
  };

  useEffect(() => {
    (async () => {
      if (router.isReady && workspaceId === 'undefined') {
        router.push('/noprojects');
      } else try {
        const { push, query } = router
        const tempNumSnapshots = await getProjectSercetSnapshotsCount({
          workspaceId
        });
        setNumSnapshots(tempNumSnapshots);
        const userWorkspaces = await getWorkspaces();
        const workspace = userWorkspaces.find((wp) => wp._id === workspaceId);
        if (!workspace) {
          push(`/dashboard/${userWorkspaces?.[0]?._id}`);
        }
        setAutoCapitalization(workspace?.autoCapitalization ?? true);

        const accessibleEnvironments = await getWorkspaceEnvironments({ workspaceId });
        setWorkspaceEnvs(accessibleEnvironments || []);

        // set env
        const env = accessibleEnvironments[0] || {
          name: 'unknown',
          slug: 'unknown'
        };
        setSelectedEnv(env);
        setSelectedSnapshotEnv(env);

        if (query.env) {
          const index = accessibleEnvironments?.findIndex(({ slug }: { slug: string }) => slug === query.env)

          setSelectedEnv({
            name: accessibleEnvironments?.[index]?.name as string,
            slug: query.env as string,
            isWriteDenied: accessibleEnvironments?.[index]?.isWriteDenied as boolean,
            isReadDenied: accessibleEnvironments?.[index]?.isReadDenied as boolean
          })
          setSelectedSnapshotEnv({
            name: accessibleEnvironments?.[index]?.name as string,
            slug: query.env as string,
            isWriteDenied: accessibleEnvironments?.[index]?.isWriteDenied as boolean,
            isReadDenied: accessibleEnvironments?.[index]?.isReadDenied as boolean
          })

        }

        const user = await getUser();
        setIsNew((Date.parse(String(new Date())) - Date.parse(user.createdAt)) / 60000 < 3);

        const userAction = await checkUserAction({
          action: 'first_time_secrets_pushed'
        });
        setHasUserEverPushed(!!userAction);

        setProjectTags(await getWorkspaceTags({ workspaceId }));
      } catch (error) {
        console.log('Error', error);
        setData(undefined);
      }
    })();
  }, [workspaceId]);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        setBlurred(true);
        // ENV
        let dataToSort;
        if (selectedEnv) {
          dataToSort = await getSecretsForProject({
            env: selectedEnv.slug,
            setIsKeyAvailable,
            setData,
            workspaceId
          });
          setInitialData(dataToSort);
          reorderRows(dataToSort);
        } else {
          setIsLoading(false);
        }
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
      {
        id: guidGenerator(),
        idOverride: guidGenerator(),
        pos: data!.length,
        key: '',
        value: '',
        valueOverride: undefined,
        comment: '',
        tags: []
      },
      ...data!
    ]);
    if (!atSecretAreaTop) {
      secretsTop.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const addRowToBottom = () => {
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
        tags: []
      }
    ]);
  };

  const deleteRow = ({ ids, secretName }: { ids: string[]; secretName: string }) => {
    setHasUnsavedChanges(true);
    toggleSidebar('None');
    createNotification({
      text: `${secretName || 'Secret'} has been deleted. Remember to save changes.`,
      type: 'error'
    });
    sortValuesHandler(
      data!.filter((row: SecretDataProps) => !ids.includes(row.id)),
      sortMethod === 'alhpabetical' ? '-alphabetical' : 'alphabetical'
    );
  };

  const modifyValue = (value: string, id: string) => {
    setData((oldData) => oldData?.map((e) => ((e.id ? e.id : e.idOverride) === id ? { ...e, value } : e)));
    setHasUnsavedChanges(true);
  };

  const modifyValueOverride = (valueOverride: string | undefined, id: string) => {
    setData((oldData) => oldData?.map((e) => ((e.id ? e.id : e.idOverride) === id ? { ...e, valueOverride } : e)));
    setHasUnsavedChanges(true);
  };

  const modifyKey = (key: string, id: string) => {
    setData((oldData) => oldData?.map((e) => ((e.id ? e.id : e.idOverride) === id ? { ...e, key } : e)));
    setHasUnsavedChanges(true);
  };

  const modifyComment = (comment: string, id: string) => {
    setData((oldData) => oldData?.map((e) => ((e.id ? e.id : e.idOverride) === id ? { ...e, comment } : e)));
    setHasUnsavedChanges(true);
  };

  const modifyTags = (tags: Tag[], id: string) => {
    setData((oldData) => oldData?.map((e) => ((e.id ? e.id : e.idOverride) === id ? { ...e, tags } : e)));
    setHasUnsavedChanges(true);
  };

  // For speed purposes and better perforamance, we are using useCallback
  const listenChangeValue = useCallback((value: string, id: string) => {
    modifyValue(value, id);
  }, []);

  const listenChangeValueOverride = useCallback((value: string | undefined, id: string) => {
    modifyValueOverride(value, id);
  }, []);

  const listenChangeKey = useCallback((value: string, id: string) => {
    modifyKey(value, id);
  }, []);

  const listenChangeComment = useCallback((value: string, id: string) => {
    modifyComment(value, id);
  }, []);

  const listenChangeTags = useCallback((value: Tag[], id: string) => {
    modifyTags(value, id);
  }, []);

  /**
   * Save the changes of environment variables and push them to the database
   */
  // TODO(akhilmhdh): split and make it small
  const savePush = async (dataToPush?: SecretDataProps[]) => {
      try {
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
          .map((secret) => !Number.isNaN(Number(secret.key.charAt(0))))
          .every((v) => v === false);
        const emptyNameError = !newData!
          .map((secret) => secret.key.length === 0)
          .every((v) => v === false);
        const duplicatesExist =
          findDuplicates(data!.map((item: SecretDataProps) => item.key)).length > 0;

        if (emptyNameError) {
          setSaveLoading(false);
          return createNotification({
            text: 'You can`t have empty secret names.',
            type: 'error'
          });
        }

        if (nameErrors) {
          setSaveLoading(false);
          return createNotification({
            text: 'Solve all name errors before saving secrets.',
            type: 'error'
          });
        }

        if (duplicatesExist) {
          setSaveLoading(false);
          return createNotification({
            text: 'Remove duplicated secret names before saving.',
            type: 'error'
          });
        }

        if (selectedEnv?.isWriteDenied) {
          setSaveLoading(false);
          return createNotification({
            text: 'You are not allowed to edit this environment',
            type: 'error'
          });
        }

        // Once "Save changes" is clicked, disable that button
        setHasUnsavedChanges(false);

        const secretsToBeDeleted = initialData!
          .filter(
            (initDataPoint) =>
              !newData!.map((newDataPoint) => newDataPoint.id).includes(initDataPoint.id)
          )
          .map((secret) => secret.id);
        console.log('delete', secretsToBeDeleted.length);

        const secretsToBeAdded = newData!.filter(
          (newDataPoint) =>
            !initialData!.map((initDataPoint) => initDataPoint.id).includes(newDataPoint.id)
        );
        console.log('add', secretsToBeAdded.length);

        const secretsToBeUpdated = newData!.filter((newDataPoint) =>
          initialData!
            .filter(
              (initDataPoint) =>
                newData!.filter((dataPoint) => dataPoint.id)
                .map((dataPoint) => dataPoint.id).includes(initDataPoint.id) &&
                (newData!.filter((dataPoint) => dataPoint.id === initDataPoint.id)[0].value !==
                  initDataPoint.value ||
                newData!.filter((dataPoint) => dataPoint.id === initDataPoint.id)[0].key !==
                  initDataPoint.key ||
                newData!.filter((dataPoint) => dataPoint.id === initDataPoint.id)[0].comment !==
                  initDataPoint.comment ||
                JSON.stringify(newData!.filter((dataPoint) => dataPoint.id === initDataPoint.id)[0]?.tags) !==
                  JSON.stringify(initDataPoint?.tags))
            )
            .map((secret) => secret.id)
            .includes(newDataPoint.id)
        );
        console.log('update', secretsToBeUpdated.length);

        const newOverrides = newData!.filter(
          (newDataPoint) => newDataPoint.valueOverride !== undefined
        );
        const initOverrides = initialData!.filter(
          (initDataPoint) => initDataPoint.valueOverride !== undefined
        );

        const overridesToBeDeleted = initOverrides
          .filter(
            (initDataPoint) =>
              !newOverrides!.map((newDataPoint) => newDataPoint.id).includes(initDataPoint.id)
          )
          .map((secret) => String(secret.idOverride));
        console.log('override delete', overridesToBeDeleted.length);

        const overridesToBeAdded = newOverrides!
          .filter(
            (newDataPoint) =>
              !initOverrides.map((initDataPoint) => initDataPoint.idOverride).includes(newDataPoint.idOverride)
          )
          .map((override) => ({
            pos: override.pos,
            key: override.key,
            value: String(override.valueOverride),
            valueOverride: override.valueOverride,
            comment: '',
            id: String(override.idOverride),
            idOverride: String(override.idOverride),
            tags: override.tags
          }));
        console.log('override add', overridesToBeAdded.length);

        const overridesToBeUpdated = newOverrides!
          .filter((newDataPoint) =>
            initOverrides
              .filter(
                (initDataPoint) =>
                  newOverrides!.map((dataPoint) => dataPoint.idOverride)
                  .includes(initDataPoint.idOverride) &&
                  (newOverrides!.filter((dataPoint) => dataPoint.idOverride === initDataPoint.idOverride)[0]
                    .valueOverride !== initDataPoint.valueOverride ||
                   newOverrides!.filter((dataPoint) => dataPoint.idOverride === initDataPoint.idOverride)[0].key !==
                    initDataPoint.key ||
                   (newOverrides!.filter((dataPoint) => dataPoint.idOverride === initDataPoint.idOverride)[0]
                    .comment || '') !== (initDataPoint.comment || '') 
                    ||
                   (JSON.stringify(newOverrides!.filter((dataPoint) => dataPoint.idOverride === initDataPoint.idOverride)[0]?.tags) || '') !==
                    (JSON.stringify(initDataPoint?.tags) || '')
                    )
              )
              .map((secret) => secret.idOverride)
              .includes(newDataPoint.idOverride)
          )
          .map((override) => ({
            pos: override.pos,
            key: override.key,
            value: String(override.valueOverride),
            valueOverride: override.valueOverride,
            comment: '',
            id: String(override.idOverride),
            idOverride: String(override.idOverride),
            tags: override.tags
          }));
        console.log('override update', overridesToBeUpdated.length);

        const requests: any = []; // TODO: fix any
        if (secretsToBeDeleted.concat(overridesToBeDeleted).length > 0) {
          secretsToBeDeleted.concat(overridesToBeDeleted).forEach((_id: string) => {
            requests.push({
              method: 'DELETE',
              secret: {
                _id
              }
            });
          });
        }
        if (selectedEnv && secretsToBeAdded.concat(overridesToBeAdded).length > 0) {
          const secrets = await encryptSecrets({
            secretsToEncrypt: secretsToBeAdded.concat(overridesToBeAdded),
            workspaceId,
            env: selectedEnv.slug
          });
          if (secrets) {
            secrets.forEach((secret) => {
              requests.push({
                method: 'POST',
                secret: {
                  type: secret.type,
                  secretName: secret.secretName,
                  secretKeyCiphertext: secret.secretKeyCiphertext,
                  secretKeyIV: secret.secretKeyIV,
                  secretKeyTag: secret.secretKeyTag,
                  secretValueCiphertext: secret.secretValueCiphertext,
                  secretValueIV: secret.secretValueIV,
                  secretValueTag: secret.secretValueTag,
                  secretCommentCiphertext: secret.secretCommentCiphertext,
                  secretCommentIV: secret.secretCommentIV,
                  secretCommentTag: secret.secretCommentTag,
                  tags: secret.tags
                }
              })
            });
          }
        }
        if (selectedEnv && !selectedEnv.isReadDenied && secretsToBeUpdated.concat(overridesToBeUpdated).length > 0) {
          const secrets = await encryptSecrets({
            secretsToEncrypt: secretsToBeUpdated.concat(overridesToBeUpdated),
            workspaceId,
            env: selectedEnv.slug
          });
          if (secrets) {
            secrets.forEach((secret) => {
              requests.push({
                method: 'PATCH',
                secret: {
                  _id: secret.id,
                  type: secret.type,
                  secretName: secret.secretName,
                  secretKeyCiphertext: secret.secretKeyCiphertext,
                  secretKeyIV: secret.secretKeyIV,
                  secretKeyTag: secret.secretKeyTag,
                  secretValueCiphertext: secret.secretValueCiphertext,
                  secretValueIV: secret.secretValueIV,
                  secretValueTag: secret.secretValueTag,
                  secretCommentCiphertext: secret.secretCommentCiphertext,
                  secretCommentIV: secret.secretCommentIV,
                  secretCommentTag: secret.secretCommentTag,
                  tags: secret.tags 
                }
              });
            });
          }
        }
        
        let newSecrets;
        if (selectedEnv && requests.length > 0) {
          newSecrets = await batchSecrets({
            workspaceId,
            environment: selectedEnv.slug,
            requests
          });
        }

        let formattedNewDecryptedKeys;
        if (newSecrets.createdSecrets) {
          const latestKey = await getLatestFileKey({ workspaceId });

          const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY') as string;

          const tempDecryptedSecrets: SecretProps[] = [];
          if (latestKey) {
            // assymmetrically decrypt symmetric key with local private key
            const key = decryptAssymmetric({
              ciphertext: latestKey.latestKey.encryptedKey,
              nonce: latestKey.latestKey.nonce,
              publicKey: latestKey.latestKey.sender.publicKey,
              privateKey: PRIVATE_KEY
            });

            // decrypt secret keys, values, and comments
            newSecrets.createdSecrets.forEach((secret: EncryptedSecretProps) => {
              const plainTextKey = decryptSymmetric({
                ciphertext: secret.secretKeyCiphertext,
                iv: secret.secretKeyIV,
                tag: secret.secretKeyTag,
                key
              });

              let plainTextValue;
              if (secret.secretValueCiphertext !== undefined) {
                plainTextValue = decryptSymmetric({
                  ciphertext: secret.secretValueCiphertext,
                  iv: secret.secretValueIV,
                  tag: secret.secretValueTag,
                  key
                });
              } else {
                plainTextValue = undefined;
              }

              let plainTextComment;
              if (secret.secretCommentCiphertext) {
                plainTextComment = decryptSymmetric({
                  ciphertext: secret.secretCommentCiphertext,
                  iv: secret.secretCommentIV,
                  tag: secret.secretCommentTag,
                  key
                });
              } else {
                plainTextComment = '';
              }

              tempDecryptedSecrets.push({
                id: secret._id,
                key: plainTextKey,
                value: plainTextValue,
                type: secret.type,
                comment: plainTextComment,
                tags: secret.tags
              });
            });
          }

          const secretKeys = [...new Set(tempDecryptedSecrets.map((secret) => secret.key))];

          formattedNewDecryptedKeys = secretKeys.map((key, index) => ({
            id: tempDecryptedSecrets.filter((secret) => secret.key === key && secret.type === 'shared')[0]
              ?.id,
            idOverride: tempDecryptedSecrets.filter(
              (secret) => secret.key === key && secret.type === 'personal'
            )[0]?.id,
            pos: (newData?.filter(dp => !dp.id?.includes('-'))?.length ?? 0) + index,
            key,
            value: tempDecryptedSecrets.filter(
              (secret) => secret.key === key && secret.type === 'shared'
            )[0]?.value,
            valueOverride: tempDecryptedSecrets.filter(
              (secret) => secret.key === key && secret.type === 'personal'
            )[0]?.value,
            comment: tempDecryptedSecrets.filter(
              (secret) => secret.key === key && secret.type === 'shared'
            )[0]?.comment,
            tags: tempDecryptedSecrets.filter(
              (secret) => secret.key === key && secret.type === 'shared'
            )[0]?.tags
          }));

          setInitialData(structuredClone(newData?.filter(dp => !dp.id?.includes('-')).concat(formattedNewDecryptedKeys.filter(dk => dk.id))));
          setData(structuredClone(newData?.filter(dp => !dp.id?.includes('-')).concat(formattedNewDecryptedKeys.filter(dk => dk.id))))
        } else {
          setInitialData(structuredClone(newData));
        }

        // If this user has never saved environment variables before, show them a prompt to read docs
        if (!hasUserEverPushed) {
          setCheckDocsPopUpVisible(true);
          await registerUserAction({ action: 'first_time_secrets_pushed' });
        }

        // increasing the number of project commits
        setNumSnapshots((numSnapshots ?? 0) + 1);
        setSaveLoading(false);
        createNotification({
          text: `Successfully saved secrets.`,
          type: 'success'
        });
      } catch (error) {
        console.log("Something went wrong while saving secrets: ", error)
        createNotification({
          text: `Something went wrong while saving secrets.`,
          type: 'error'
        });
      }
    return undefined;
  };

  const addDataWithMerge = (newData: SecretDataProps[], preserve?: 'old' | 'new') => {
    setData((oldData) => {
      let filteredOldData = oldData!;
      let filteredNewData = newData;
      if (preserve === 'new')
        filteredOldData = oldData!.filter(
          (oldDataPoint) => !newData.find((newDataPoint) => newDataPoint.key === oldDataPoint.key)
        );
      if (preserve === 'old')
        filteredNewData = newData.filter(
          (newDataPoint) => !oldData?.find((oldDataPoint) => oldDataPoint.key === newDataPoint.key)
        );
      return filteredOldData.concat(filteredNewData);
    });
    setHasUnsavedChanges(true);
  };

  const addData = (newData: SecretDataProps[]) => {
    if (
      newData.some((newDataPoint) => data?.find((dataPoint) => dataPoint.key === newDataPoint.key)) // if newData contains duplicates
    ) {
      setDropZoneData(newData);
      return;
    }
    addDataWithMerge(newData);
  };

  const changeBlurred = () => {
    setBlurred(!blurred);
  };

  const deleteCertainRow = ({ ids, secretName }: { ids: string[]; secretName: string }) => {
    deleteRow({ ids, secretName });
  };

  const handleOnEnvironmentChange = (envSlug: string) => {
    if (hasUnsavedChanges) {
      if (!window.confirm(leaveConfirmDefaultMessage)) return;
    }

    const selectedWorkspaceEnv = workspaceEnvs.find(
      ({ slug }: { slug: string }) => envSlug === slug
    ) || {
      name: 'unknown',
      slug: 'unknown',
      isWriteDenied: false,
      isReadDenied: false
    };

    if (selectedWorkspaceEnv) {
      if (snapshotData) setSelectedSnapshotEnv(selectedWorkspaceEnv);
      else setSelectedEnv(selectedWorkspaceEnv);
    }

    setHasUnsavedChanges(false);
    router.push({
      pathname: router.pathname,
      query: { ...router.query, env: selectedWorkspaceEnv.slug },
    })
  };

  return <div>
    {!envInURL 
    ? <DashboardEnvOverview onEnvChange={handleOnEnvironmentChange} />
    : (data ? (
    <div className="bg-bunker-800 max-h-screen h-full relative flex flex-col justify-between text-white dark">
      <Head>
        <title>{t('common:head-title', { title: t('dashboard:title') })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={String(t('dashboard:og-title'))} />
        <meta name="og:description" content={String(t('dashboard:og-description'))} />
      </Head>
      <div className="flex flex-row h-full">
        <ConfirmEnvOverwriteModal
          isOpen={!!dropZoneData}
          onClose={() => setDropZoneData(undefined)}
          onOverwriteConfirm={(preserve) => {
            addDataWithMerge(dropZoneData!, preserve);
            setDropZoneData(undefined);
          }}
          duplicateKeys={
            dropZoneData
              ?.filter((newDataPoint) =>
                data?.find((dataPoint) => dataPoint.key === newDataPoint.key)
              )
              .map((duplicate) => duplicate.key) ?? []
          }
        />
        <div className="w-full max-h-96 dark:[color-scheme:dark]">
          <NavHeaderSecrets
            pageName={t('dashboard:title')} 
            currentEnv={selectedEnv?.name || ''} 
            isProjectRelated 
            isSnapshot={snapshotData !== undefined}
            userAvailableEnvs={workspaceEnvs}
            onEnvChange={handleOnEnvironmentChange}
          />
          {checkDocsPopUpVisible && (
            <BottonRightPopup
              buttonText={t('dashboard:check-docs.button')}
              buttonLink="https://infisical.com/docs/getting-started/introduction"
              titleText={t('dashboard:check-docs.title')}
              emoji="🎉"
              textLine1={t('dashboard:check-docs.line1')}
              textLine2={t('dashboard:check-docs.line2')}
              setCheckDocsPopUpVisible={setCheckDocsPopUpVisible}
            />
          )}
          <div className="flex flex-row justify-between items-center mx-6 mt-6 mb-3 text-xl">
            {snapshotData && (
              <div className="flex justify-start max-w-sm mt-1 mr-2">
                <Button
                  text={String(t('To Current'))}
                  onButtonPressed={() => setSnapshotData(undefined)}
                  color="mineshaft"
                  size="md"
                  icon={faArrowLeft}
                />
              </div>
            )}
            <div className="flex flex-row justify-start items-center text-3xl">
              <div className="font-semibold mr-4 mt-1 flex flex-row items-center">
                <p>{snapshotData ? 'Secret Snapshot' : ''}</p>
                {snapshotData && (
                  <span className="bg-primary-800 text-xs ml-4 mt-1 px-1.5 rounded-md w-min">
                    {new Date(snapshotData.createdAt).toLocaleString()}
                  </span>
                )}
                {selectedEnv?.isReadDenied && (
                  <span className="bg-primary-500 text-black text-sm ml-4 mt-1 px-1.5 rounded-md">
                    Add Only Mode
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-row">
              <div className="flex justify-start max-w-sm mt-1 mr-2">
                {!selectedEnv?.isReadDenied && (
                  <Button
                    text={String(`${numSnapshots} ${t('Commits')}`)}
                    onButtonPressed={() => {
                      toggleSidebar('None');
                      togglePITSidebar(true);
                    }}
                    color="mineshaft"
                    size="md"
                    icon={faClockRotateLeft}
                  />
                )}
              </div>
              {(data?.length !== 0 || hasUnsavedChanges) && !snapshotData && (
                <div className="flex justify-start max-w-sm mt-1">
                  <Button
                    text={String(t('common:save-changes'))}
                    onButtonPressed={savePush}
                    color="primary"
                    size="md"
                    active={hasUnsavedChanges}
                    iconDisabled={faCheck}
                    textDisabled={String(t('common:saved'))}
                    loading={saveLoading}
                  />
                </div>
              )}
              {snapshotData && selectedEnv && (
                <div className="flex justify-start max-w-sm mt-1">
                  <Button
                    text={String(t('Rollback to this snapshot'))}
                    onButtonPressed={async () => {
                      // Update secrets in the state only for the current environment
                      const rolledBackSecrets = snapshotData.secretVersions
                        .filter((row) => row.environment === selectedEnv.slug)
                        .map((sv, position) => ({
                          id: sv.id,
                          idOverride: sv.id,
                          pos: position,
                          valueOverride: sv.valueOverride,
                          key: sv.key,
                          value: sv.value,
                          comment: '',
                          tags: sv.tags
                        }));

                      // Perform the rollback globally
                      const result = await performSecretRollback({ workspaceId, version: snapshotData.version });
                      if (result === undefined) {
                        createNotification({
                          text: `Something went wrong during the rollback.`,
                          type: 'error'
                        });
                      } else {
                        setData(rolledBackSecrets);
                        createNotification({
                          text: `Successfully rolled back secrets.`,
                          type: 'success'
                        });
                        setSnapshotData(undefined);
                        setHasUnsavedChanges(false);
                        togglePITSidebar(false);
                      }
                    }}
                    color="primary"
                    size="md"
                    active={hasUnsavedChanges}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="mx-6 w-full pr-12">
            <div className="flex flex-col pb-1">
              <div className="w-full flex flex-row items-start">
                {(snapshotData || data?.length !== 0) && selectedEnv && (
                  <>
                    <div className="h-10 w-full bg-mineshaft-800 border border-mineshaft-600 hover:bg-mineshaft-700 duration-200 rounded-md flex flex-row items-center">
                      <FontAwesomeIcon
                        className="bg-transparent rounded-l-md py-[0.7rem] pl-4 pr-2 text-bunker-300 text-sm"
                        icon={faMagnifyingGlass}
                      />
                      <input
                        className="pl-2 text-bunker-300 rounded-r-md bg-transparent w-full h-full outline-none text-sm placeholder:hover:text-bunker-200 placeholder:focus:text-transparent"
                        value={searchKeys}
                        onChange={(e) => setSearchKeys(e.target.value)}
                        placeholder={String(t('dashboard:search-keys'))}
                      />
                    </div>
                    {!snapshotData && !selectedEnv.isReadDenied && (
                      <div className="ml-2 min-w-max flex flex-row items-start justify-start">
                        <DownloadSecretMenu data={data} env={selectedEnv.slug} />
                      </div>
                    )}
                    <div className="ml-2 min-w-max flex flex-row items-start justify-start">
                      <Button
                        onButtonPressed={changeBlurred}
                        color="mineshaft"
                        size="icon-md"
                        icon={blurred ? faEye : faEyeSlash}
                      />
                    </div>
                    {!snapshotData && (
                      <div className="relative ml-2 min-w-max flex flex-row items-start justify-end">
                        <Button
                          text={String(t('dashboard:add-key'))}
                          onButtonPressed={addRow}
                          color="mineshaft"
                          icon={faPlus}
                          size="md"
                        />
                        {isNew && (
                          <span className="absolute right-0 flex h-3 w-3 items-center justify-center ml-4 mb-4">
                            <span className="animate-ping absolute inline-flex rounded-full bg-primary/50 opacity-75 h-4 w-4" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center h-full my-48">
                <Image
                  src="/images/loading/loading.gif"
                  height={60}
                  width={100}
                  alt="infisical loading indicator"
                />
              </div>
            ) : (data?.length !== 0 || snapshotData?.secretVersions) ? (
              <div className="flex flex-col w-full mt-1">
                <div
                  onScroll={onSecretsAreaScroll}
                  className="mt-1 max-h-[calc(100vh-280px)] overflow-hidden overflow-y-scroll no-scrollbar no-scrollbar::-webkit-scrollbar border border-mineshaft-600 rounded-md"
                >
                  <div ref={secretsTop} />
                  <div className="group flex flex-col items-center bg-mineshaft-800 border-b-2 border-mineshaft-500 duration-100 sticky top-0 z-[60]">
                    <div className="relative flex flex-row justify-between w-full mr-auto max-h-14 items-center">
                      <div className="w-[23%] border-r border-mineshaft-600 flex flex-row items-center">
                        <div className='text-transparent text-xs flex items-center justify-center w-12 h-10 cursor-default'>0</div>
                        <span className='px-2 text-bunker-300 font-semibold'>Key</span>
                        {!snapshotData && <IconButton
                          ariaLabel="copy icon"
                          variant="plain"
                          className="group relative ml-2"
                          onClick={() => reorderRows(1)}
                        >
                          {sortMethod === 'alphabetical' ? <FontAwesomeIcon icon={faArrowUp} /> : <FontAwesomeIcon icon={faArrowDown} />}
                        </IconButton>}
                      </div>
                      <div className="w-5/12 border-r border-mineshaft-600">
                        <div className="flex items-center rounded-lg mt-4 md:mt-0 max-h-10">
                          <div className="text-bunker-300 px-2 font-semibold h-10 flex items-center w-7/12">
                            Value
                          </div>
                        </div>
                      </div>
                      <div className="w-[calc(10%)] border-r border-mineshaft-600">
                        <div className="flex items-center max-h-16 overflow-hidden">
                          <div className="text-bunker-300 px-2 font-semibold h-10 flex items-center w-3/12">
                            Comment
                          </div>
                        </div>
                      </div>
                      <div className="w-2/12">
                        <div className="flex items-center max-h-16">
                          <div className="text-bunker-300 px-2 font-semibold h-10 flex items-center w-3/12">
                            Tags
                          </div>
                        </div>
                      </div>
                      <div className="w-[1.5rem] h-[2.35rem] ml-auto rounded-md flex flex-row justify-center items-center" />
                      <div className="w-[1.5rem] h-[2.35rem] mr-2 flex items-center justfy-center">
                        <div
                          onKeyDown={() => null}
                          role="none"
                          onClick={() => { }}
                          className="invisible group-hover:visible"
                        >
                          <FontAwesomeIcon
                            className="text-bunker-300 hover:text-red pl-2 pr-6 text-lg mt-0.5 invisible"
                            icon={faXmark}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-mineshaft-800 rounded-b-md border-bunker-600">
                    {!snapshotData &&
                      data
                        ?.filter((row) =>
                          row.key?.toUpperCase().includes(searchKeys.toUpperCase())
                          || row.tags?.map(tag => tag.name).join(" ")?.toUpperCase().includes(searchKeys.toUpperCase())
                          || row.comment?.toUpperCase().includes(searchKeys.toUpperCase()))
                        .filter((row) => !sharedToHide.includes(row.id))
                        // .filter((row) => row.value !== undefined)
                        .map((keyPair) => (
                          <KeyPair
                            isCapitalized={autoCapitalization}
                            key={keyPair.id ? keyPair.id : keyPair.idOverride}
                            keyPair={keyPair}
                            modifyValue={listenChangeValue}
                            modifyValueOverride={listenChangeValueOverride}
                            modifyKey={listenChangeKey}
                            modifyComment={listenChangeComment}
                            modifyTags={listenChangeTags}
                            isBlurred={blurred}
                            isDuplicate={findDuplicates(data?.map((item) => item.key))?.includes(
                              keyPair.key
                            )}
                            toggleSidebar={toggleSidebar}
                            togglePITSidebar={togglePITSidebar}
                            sidebarSecretId={sidebarSecretId}
                            isSnapshot={false}
                            deleteRow={deleteCertainRow}
                            tags={projectTags}
                          />
                        ))}
                    {snapshotData &&
                      snapshotData.secretVersions
                        ?.sort((a, b) => a.key.localeCompare(b.key))
                        .filter((row) => row.environment === selectedSnapshotEnv?.slug)
                        .filter((row) => row.key.toUpperCase().includes(searchKeys.toUpperCase()))
                        .map((keyPair) => (
                          <KeyPair
                            isCapitalized={autoCapitalization}
                            key={keyPair.id}
                            keyPair={keyPair}
                            modifyValue={listenChangeValue}
                            modifyValueOverride={listenChangeValueOverride}
                            modifyKey={listenChangeKey}
                            modifyComment={listenChangeComment}
                            modifyTags={listenChangeTags}
                            isBlurred={blurred}
                            isDuplicate={findDuplicates(data?.map((item) => item.key))?.includes(
                              keyPair.key
                            )}
                            toggleSidebar={toggleSidebar}
                            sidebarSecretId={sidebarSecretId}
                            isSnapshot
                            tags={projectTags}
                          />
                        ))}
                    <div className="bg-mineshaft-800 text-sm rounded-t-md hover:bg-mineshaft-700 h-10 w-full flex flex-row items-center border-b-2 border-mineshaft-500 sticky top-0 z-[60]">
                      <div className="w-10" />
                      <button
                        type="button"
                        className="text-bunker-300 relative font-normal h-10 flex items-center w-full cursor-pointer"
                        onClick={addRowToBottom}
                      >
                        <FontAwesomeIcon icon={faPlus} className="mr-3" />
                        <span className="text-sm">Add Secret</span>
                      </button>
                    </div>
                  </div>
                  {!snapshotData && (
                    <div className="w-full px-2 pt-3">
                      <DropZone
                        setData={addData}
                        setErrorDragAndDrop={setErrorDragAndDrop}
                        createNewFile={addRow}
                        errorDragAndDrop={errorDragAndDrop}
                        setButtonReady={setHasUnsavedChanges}
                        keysExist
                        numCurrentRows={data.length}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-xl text-gray-400 mt-28">
                {isKeyAvailable && !snapshotData && (
                  <DropZone
                    setData={setData}
                    setErrorDragAndDrop={setErrorDragAndDrop}
                    createNewFile={addRow}
                    errorDragAndDrop={errorDragAndDrop}
                    setButtonReady={setHasUnsavedChanges}
                    numCurrentRows={data.length}
                    keysExist={false}
                  />
                )}
                {!isKeyAvailable && (
                  <>
                    <FontAwesomeIcon className="text-7xl mt-20 mb-8" icon={faFolderOpen} />
                    <p>To view this file, contact your administrator for permission.</p>
                    <p className="mt-1">They need to grant you access in the team tab.</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {sidebarSecretId !== 'None' && (
          <SideBar
            toggleSidebar={toggleSidebar}
            data={data.filter(
              (row: SecretDataProps) => row.id === sidebarSecretId && row.value !== undefined
            )}
            modifyKey={listenChangeKey}
            modifyValue={listenChangeValue}
            modifyValueOverride={listenChangeValueOverride}
            modifyComment={listenChangeComment}
            buttonReady={hasUnsavedChanges}
            workspaceEnvs={workspaceEnvs}
            selectedEnv={selectedEnv!}
            workspaceId={workspaceId}
            savePush={savePush}
            sharedToHide={sharedToHide}
            setSharedToHide={setSharedToHide}
            deleteRow={deleteCertainRow}
          />
        )}
        {PITSidebarOpen && (
          <PITRecoverySidebar
            toggleSidebar={togglePITSidebar}
            chosenSnapshot={String(snapshotData?.id ? snapshotData.id : '')}
            setSnapshotData={setSnapshotData}
          />
        )}
      </div>
    </div>
  ) : (
    <div className="relative z-10 w-10/12 mr-auto h-screen ml-2 bg-bunker-800 flex flex-col items-center justify-center">
      <Image src="/images/loading/loading.gif" height={70} width={120} alt="loading animation" />
    </div>
  ))}</div>
}

Dashboard.requireAuth = true;

export const getServerSideProps = getTranslatedServerSideProps(['dashboard']);
