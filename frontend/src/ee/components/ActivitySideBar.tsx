import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import getActionData from '@app/ee/api/secrets/GetActionData';
import patienceDiff from '@app/ee/utilities/findTextDifferences';
import getLatestFileKey from '@app/pages/api/workspace/getLatestFileKey';

import {
  decryptAssymmetric,
  decryptSymmetric
} from '../../components/utilities/cryptography/crypto';

interface SideBarProps {
  toggleSidebar: (value: string) => void;
  currentAction: string;
}

interface SecretProps {
  secret: string;
  secretKeyCiphertext: string;
  secretKeyHash: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueHash: string;
  secretValueIV: string;
  secretValueTag: string;
}

interface DecryptedSecretProps {
  newSecretVersion: {
    key: string;
    value: string;
  };
  oldSecretVersion: {
    key: string;
    value: string;
  };
}

interface ActionProps {
  name: string;
}

/**
 * @param {object} obj
 * @param {function} obj.toggleSidebar - function that opens or closes the sidebar
 * @param {string} obj.currentAction - the action id for which a sidebar is being displayed
 * @returns the sidebar with the payload of user activity logs
 */
const ActivitySideBar = ({ toggleSidebar, currentAction }: SideBarProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [actionData, setActionData] = useState<DecryptedSecretProps[]>();
  const [actionMetaData, setActionMetaData] = useState<ActionProps>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const getLogData = async () => {
      setIsLoading(true);
      const tempActionData = await getActionData({ actionId: currentAction });
      const latestKey = await getLatestFileKey({ workspaceId: String(router.query.id) });
      const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY');

      // #TODO: make this a separate function and reuse across the app
      let decryptedLatestKey: string;
      if (latestKey) {
        // assymmetrically decrypt symmetric key with local private key
        decryptedLatestKey = decryptAssymmetric({
          ciphertext: latestKey.latestKey.encryptedKey,
          nonce: latestKey.latestKey.nonce,
          publicKey: latestKey.latestKey.sender.publicKey,
          privateKey: String(PRIVATE_KEY)
        });
      }

      const decryptedSecretVersions = tempActionData.payload.secretVersions.map(
        (encryptedSecretVersion: {
          newSecretVersion?: SecretProps;
          oldSecretVersion?: SecretProps;
        }) => ({
          newSecretVersion: {
            key: decryptSymmetric({
              ciphertext: encryptedSecretVersion.newSecretVersion!.secretKeyCiphertext,
              iv: encryptedSecretVersion.newSecretVersion!.secretKeyIV,
              tag: encryptedSecretVersion.newSecretVersion!.secretKeyTag,
              key: decryptedLatestKey
            }),
            value: decryptSymmetric({
              ciphertext: encryptedSecretVersion.newSecretVersion!.secretValueCiphertext,
              iv: encryptedSecretVersion.newSecretVersion!.secretValueIV,
              tag: encryptedSecretVersion.newSecretVersion!.secretValueTag,
              key: decryptedLatestKey
            })
          },
          oldSecretVersion: {
            key: encryptedSecretVersion.oldSecretVersion?.secretKeyCiphertext
              ? decryptSymmetric({
                  ciphertext: encryptedSecretVersion.oldSecretVersion?.secretKeyCiphertext,
                  iv: encryptedSecretVersion.oldSecretVersion?.secretKeyIV,
                  tag: encryptedSecretVersion.oldSecretVersion?.secretKeyTag,
                  key: decryptedLatestKey
                })
              : undefined,
            value: encryptedSecretVersion.oldSecretVersion?.secretValueCiphertext
              ? decryptSymmetric({
                  ciphertext: encryptedSecretVersion.oldSecretVersion?.secretValueCiphertext,
                  iv: encryptedSecretVersion.oldSecretVersion?.secretValueIV,
                  tag: encryptedSecretVersion.oldSecretVersion?.secretValueTag,
                  key: decryptedLatestKey
                })
              : undefined
          }
        })
      );

      setActionData(decryptedSecretVersions);
      setActionMetaData({ name: tempActionData.name });
      setIsLoading(false);
    };
    getLogData();
  }, [currentAction]);

  return (
    <div
      className={`absolute border-l border-mineshaft-500 ${
        isLoading ? 'bg-bunker-800' : 'bg-bunker'
      } fixed h-[calc(100vh-56px)] w-96 top-14 right-0 z-40 shadow-xl flex flex-col justify-between`}
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-full mb-8">
          <Image
            src="/images/loading/loading.gif"
            height={60}
            width={100}
            alt="infisical loading indicator"
          />
        </div>
      ) : (
        <div className="h-min">
          <div className="flex flex-row px-4 py-3 border-b border-mineshaft-500 justify-between items-center">
            <p className="font-semibold text-lg text-bunker-200">
              {t(`activity:event.${actionMetaData?.name}`)}
            </p>
            <div
              className="p-1"
              onKeyDown={() => null}
              role="button"
              tabIndex={0}
              onClick={() => toggleSidebar('')}
            >
              <FontAwesomeIcon icon={faXmark} className="w-4 h-4 text-bunker-300 cursor-pointer" />
            </div>
          </div>
          <div className="flex flex-col px-4 overflow-y-auto h-[calc(100vh-120px)] overflow-y-autp">
            {(actionMetaData?.name === 'readSecrets' ||
              actionMetaData?.name === 'addSecrets' ||
              actionMetaData?.name === 'deleteSecrets') &&
              actionData?.map((item, id) => (
                <div key={`secret.${id + 1}`}>
                  <div className="text-xs text-bunker-200 mt-4 pl-1 ph-no-capture">
                    {item.newSecretVersion.key}
                  </div>
                  <div className='w-full font-mono text-sm break-all bg-mineshaft-600 px-2 py-0.5 rounded-md border border-mineshaft-500 text-bunker-200'>
                    {item.newSecretVersion.value ? <span> {item.newSecretVersion.value} </span> : <span className='text-bunker-400'> EMPTY </span>}
                  </div>
                </div>
              ))}
            {actionMetaData?.name === 'updateSecrets' &&
              actionData?.map((item, id) => (
                <>
                  <div className="text-xs text-bunker-200 mt-4 pl-1">
                    {item.newSecretVersion.key}
                  </div>
                  <div className="break-all text-bunker-200 font-mono rounded-md overflow-hidden border border-mineshaft-500">
                    <div className="bg-red/40 px-2 ph-no-capture">
                      -{' '}
                      {patienceDiff(
                        item.oldSecretVersion.value.split(''),
                        item.newSecretVersion.value.split(''),
                        false
                      ).lines.map(
                        (character, lineId) =>
                          character.bIndex !== -1 && (
                            <span
                              key={`actionData.${id + 1}.line.${lineId + 1}`}
                              className={`${character.aIndex === -1 && 'text-bunker-100 bg-red-700/80'}`}
                            >
                              {character.line}
                            </span>
                          )
                      )}
                    </div>
                    <div className="break-all bg-green-500/40 px-2 ph-no-capture">
                      +{' '}
                      {patienceDiff(
                        item.oldSecretVersion.value.split(''),
                        item.newSecretVersion.value.split(''),
                        false
                      ).lines.map(
                        (character, lineId) =>
                          character.aIndex !== -1 && (
                            <span
                              key={`actionData.${id + 1}.linev2.${lineId + 1}`}
                              className={`${character.bIndex === -1 && 'text-bunker-100 bg-green-700/80'}`}
                            >
                              {character.line}
                            </span>
                          )
                      )}
                    </div>
                  </div>
                </>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivitySideBar;
