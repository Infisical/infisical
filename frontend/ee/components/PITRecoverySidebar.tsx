import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import getProjectSecretShanpshots from "ee/api/secrets/GetProjectSercetShanpshots";
import getSecretSnapshotData from "ee/api/secrets/GetSecretSnapshotData";
import timeSince from "ee/utilities/timeSince";

import Button from "~/components/basic/buttons/Button";
import { decryptAssymmetric, decryptSymmetric } from "~/components/utilities/cryptography/crypto";
import getLatestFileKey from "~/pages/api/workspace/getLatestFileKey";


interface SideBarProps {
  toggleSidebar: (value: boolean) => void; 
  setSnapshotData: (value: any) => void;
  chosenSnapshot: string;
}

interface SnaphotProps {
  _id: string;
  createdAt: string;
  secretVersions: string[];
}

interface EncrypetedSecretVersionListProps {
  _id: string;
  createdAt: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  environment: string;
  type: "personal" | "shared";
}

/**
 * @param {object} obj
 * @param {function} obj.toggleSidebar - function that opens or closes the sidebar
 * @param {function} obj.setSnapshotData - state manager for snapshot data
 * @param {string} obj.chosenSnaphshot - the snapshot id which is currently selected
 * 
 * 
 * @returns the sidebar with the options for point-in-time recovery (commits)
 */
const PITRecoverySidebar = ({ 
  toggleSidebar, 
  setSnapshotData,
  chosenSnapshot
}: SideBarProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [secretSnapshotsMetadata, setSecretSnapshotsMetadata] = useState<SnaphotProps[]>([]);
  const [currentOffset, setCurrentOffset] = useState(0);
  const currentLimit = 15;

  const loadMoreSnapshots = () => {
    setCurrentOffset(currentOffset + currentLimit);
  }

  useEffect(() => {
    const getLogData = async () => {
      setIsLoading(true);
      const results = await getProjectSecretShanpshots({ workspaceId: String(router.query.id), limit: currentLimit, offset: currentOffset })
      setSecretSnapshotsMetadata(secretSnapshotsMetadata.concat(results));
      setIsLoading(false);
    }
    getLogData();
  }, [currentOffset]);

  const exploreSnapshot = async ({ snapshotId }: { snapshotId: string; }) => {
    const secretSnapshotData = await getSecretSnapshotData({ secretSnapshotId: snapshotId });

    const latestKey = await getLatestFileKey({ workspaceId: String(router.query.id) })
    const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY');

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

    const decryptedSecretVersions = secretSnapshotData.secretVersions.map((encryptedSecretVersion: EncrypetedSecretVersionListProps, pos: number) => { 
      return {
        id: encryptedSecretVersion._id,
        pos: pos,
        type: encryptedSecretVersion.type,
        environment: encryptedSecretVersion.environment,
        key: decryptSymmetric({
          ciphertext: encryptedSecretVersion.secretKeyCiphertext,
          iv: encryptedSecretVersion.secretKeyIV,
          tag: encryptedSecretVersion.secretKeyTag,
          key: decryptedLatestKey
        }),
        value: decryptSymmetric({
          ciphertext: encryptedSecretVersion.secretValueCiphertext,
          iv: encryptedSecretVersion.secretValueIV,
          tag: encryptedSecretVersion.secretValueTag,
          key: decryptedLatestKey
        })
      }
    })

    setSnapshotData({ id: secretSnapshotData._id, version: secretSnapshotData.version, createdAt: secretSnapshotData.createdAt, secretVersions: decryptedSecretVersions })
  }

  return <div className={`absolute border-l border-mineshaft-500 ${isLoading ? "bg-bunker-800" : "bg-bunker"} fixed h-full w-96 top-14 right-0 z-40 shadow-xl flex flex-col justify-between`}>
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
          <p className="font-semibold text-lg text-bunker-200">{t("Point-in-time Recovery")}</p>
          <div className='p-1' onClick={() => toggleSidebar(false)}>
            <FontAwesomeIcon icon={faX} className='w-4 h-4 text-bunker-300 cursor-pointer'/>
          </div>
        </div>
        <div className='flex flex-col px-2 py-2'>
          {secretSnapshotsMetadata?.map((snapshot: SnaphotProps, id: number) => <div key={snapshot._id} className={`${chosenSnapshot == snapshot._id || (id == 0 && chosenSnapshot === "") ? "bg-primary text-black" : "bg-mineshaft-700"} py-3 px-4 mb-2 rounded-md flex flex-row justify-between items-center`}>
            <div className="flex flex-row items-start">
              <div className={`${chosenSnapshot == snapshot._id || (id == 0 && chosenSnapshot === "") ? "text-bunker-800" : "text-bunker-200"} text-sm mr-1.5`}>{timeSince(new Date(snapshot.createdAt))}</div>
              <div className={`${chosenSnapshot == snapshot._id || (id == 0 && chosenSnapshot === "") ? "text-bunker-900" : "text-bunker-300"} text-sm `}>{" - " + snapshot.secretVersions.length + " Secrets"}</div>
            </div>
            <div 
              onClick={() => exploreSnapshot({ snapshotId: snapshot._id })}
              className={`${chosenSnapshot == snapshot._id || (id == 0 && chosenSnapshot === "") ? "text-bunker-800 pointer-events-none" : "text-bunker-200 hover:text-primary duration-200 cursor-pointer"} text-sm`}>
              {id == 0 ? "Current Version" : chosenSnapshot == snapshot._id ? "Currently Viewing" : "Explore"}
            </div>
          </div>)}
        <div className='flex justify-center w-full mb-14'>
          <div className='items-center w-40'>
            <Button text="View More" textDisabled="End of History" active={secretSnapshotsMetadata.length % 15 == 0 ? true : false} onButtonPressed={loadMoreSnapshots} size="md" color="mineshaft"/>
          </div>
        </div>
        </div>
      </div>
    )}
  </div>
};

export default PITRecoverySidebar;
