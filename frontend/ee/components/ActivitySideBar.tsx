import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import getActionData from "ee/api/secrets/GetActionData";
import patienceDiff from 'ee/utilities/findTextDifferences';

import getLatestFileKey from "~/pages/api/workspace/getLatestFileKey";

import DashboardInputField from '../../components/dashboard/DashboardInputField';


const {
  decryptAssymmetric,
  decryptSymmetric
} = require('../../components/utilities/cryptography/crypto');
const nacl = require('tweetnacl');
nacl.util = require('tweetnacl-util');


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
  }
  oldSecretVersion: {
    key: string;
    value: string;
  }
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
const ActivitySideBar = ({ 
  toggleSidebar, 
  currentAction
}: SideBarProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [actionData, setActionData] = useState<DecryptedSecretProps[]>();
  const [actionMetaData, setActionMetaData] = useState<ActionProps>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const getLogData = async () => {
      setIsLoading(true);
      const tempActionData = await getActionData({ actionId: currentAction });
      const latestKey = await getLatestFileKey({ workspaceId: String(router.query.id) })
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
      
      const decryptedSecretVersions = tempActionData.payload.secretVersions.map((encryptedSecretVersion: {
        newSecretVersion?: SecretProps;
        oldSecretVersion?: SecretProps;
      }) => { 
        return {
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
            }): undefined,
            value: encryptedSecretVersion.oldSecretVersion?.secretValueCiphertext
            ? decryptSymmetric({
              ciphertext: encryptedSecretVersion.oldSecretVersion?.secretValueCiphertext,
              iv: encryptedSecretVersion.oldSecretVersion?.secretValueIV,
              tag: encryptedSecretVersion.oldSecretVersion?.secretValueTag,
              key: decryptedLatestKey
            }): undefined
          }
        }
      })

      setActionData(decryptedSecretVersions);
      setActionMetaData({name: tempActionData.name});
      setIsLoading(false);
    }
    getLogData();
  }, [currentAction]);

  return <div className={`absolute border-l border-mineshaft-500 ${isLoading ? "bg-bunker-800" : "bg-bunker"} fixed h-full w-96 top-14 right-0 z-50 shadow-xl flex flex-col justify-between`}>
    {isLoading ? (
      <div className="flex items-center justify-center h-full mb-8">
        <Image
          src="/images/loading/loading.gif"
          height={60}
          width={100}
          alt="infisical loading indicator"
        ></Image>
      </div> 
    ) : (
      <div className='h-min overflow-y-auto'>
        <div className="flex flex-row px-4 py-3 border-b border-mineshaft-500 justify-between items-center">
          <p className="font-semibold text-lg text-bunker-200">{t("activity:event." + actionMetaData?.name)}</p>
          <div className='p-1' onClick={() => toggleSidebar("")}>
            <FontAwesomeIcon icon={faX} className='w-4 h-4 text-bunker-300 cursor-pointer'/>
          </div>
        </div>
        <div className='flex flex-col px-4'>
          {(actionMetaData?.name == 'readSecrets' 
          || actionMetaData?.name == 'addSecrets' 
          || actionMetaData?.name  == 'deleteSecrets') && actionData?.map((item, id) => 
            <div key={id}>
              <div className='text-xs text-bunker-200 mt-4 pl-1'>{item.newSecretVersion.key}</div>
              <DashboardInputField
                key={id}
                onChangeHandler={() => {}}
                type="value"
                position={1}
                value={item.newSecretVersion.value}
                isDuplicate={false}
                blurred={false}
              />
            </div>
          )}
          {actionMetaData?.name == 'updateSecrets' && actionData?.map((item, id) => 
            <>
              <div className='text-xs text-bunker-200 mt-4 pl-1'>{item.newSecretVersion.key}</div>
              <div className='text-bunker-100 font-mono rounded-md overflow-hidden'>
                <div className='bg-red/30 px-2'>- {patienceDiff(item.oldSecretVersion.value.split(''), item.newSecretVersion.value.split(''), false).lines.map((character, id) => character.bIndex != -1 && <span key={id} className={`${character.aIndex == -1 && "bg-red-700/80"}`}>{character.line}</span>)}</div>
                <div className='bg-green-500/30 px-2'>+ {patienceDiff(item.oldSecretVersion.value.split(''), item.newSecretVersion.value.split(''), false).lines.map((character, id) => character.aIndex != -1 && <span key={id} className={`${character.bIndex == -1 && "bg-green-700/80"}`}>{character.line}</span>)}</div>
              </div>
            </>
          )}
        </div>
      </div>
    )}
  </div>
};

export default ActivitySideBar;
