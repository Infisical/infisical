/* eslint-disable no-nested-ternary */
import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/router";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tag } from "public/data/frequentInterfaces";

import Button from "@app/components/basic/buttons/Button";
import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import getProjectSecretShanpshots from "@app/ee/api/secrets/GetProjectSercetShanpshots";
import getSecretSnapshotData from "@app/ee/api/secrets/GetSecretSnapshotData";
import timeSince from "@app/ee/utilities/timeSince";
import getLatestFileKey from "@app/pages/api/workspace/getLatestFileKey";

export interface SecretDataProps {
  pos: number;
  key: string;
  value: string;
  type: string;
  id: string;
  environment: string;
}

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
  tags: Tag[];
}

/**
 * @param {object} obj
 * @param {function} obj.toggleSidebar - function that opens or closes the sidebar
 * @param {function} obj.setSnapshotData - state manager for snapshot data
 * @param {string} obj.chosenSnaphshot - the snapshot id which is currently selected
 * @returns the sidebar with the options for point-in-time recovery (commits)
 */
const PITRecoverySidebar = ({ toggleSidebar, setSnapshotData, chosenSnapshot }: SideBarProps) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [secretSnapshotsMetadata, setSecretSnapshotsMetadata] = useState<SnaphotProps[]>([]);
  const [currentOffset, setCurrentOffset] = useState(0);
  const currentLimit = 15;

  const loadMoreSnapshots = () => {
    setCurrentOffset(currentOffset + currentLimit);
  };

  useEffect(() => {
    const getLogData = async () => {
      setIsLoading(true);
      const results = await getProjectSecretShanpshots({
        workspaceId: String(router.query.id),
        limit: currentLimit,
        offset: currentOffset
      });
      setSecretSnapshotsMetadata(secretSnapshotsMetadata.concat(results));
      setIsLoading(false);
    };
    getLogData();
  }, [currentOffset]);

  const exploreSnapshot = async ({ snapshotId }: { snapshotId: string }) => {
    const secretSnapshotData = await getSecretSnapshotData({ secretSnapshotId: snapshotId });

    const latestKey = await getLatestFileKey({ workspaceId: String(router.query.id) });
    const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY");

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

    const decryptedSecretVersions = secretSnapshotData.secretVersions
      .filter(
        (sv: EncrypetedSecretVersionListProps) =>
          sv.type !== undefined && sv.environment !== undefined
      )
      .map((encryptedSecretVersion: EncrypetedSecretVersionListProps, pos: number) => ({
        id: encryptedSecretVersion._id,
        pos,
        type: encryptedSecretVersion.type,
        environment: encryptedSecretVersion.environment,
        tags: encryptedSecretVersion.tags,
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
      }));

    const secretKeys = [
      ...new Set(
        decryptedSecretVersions
          .filter((dsv: any) => dsv.type !== undefined || dsv.environemnt !== undefined)
          .map((secret: SecretDataProps) => secret.key)
      )
    ];

    const result = secretKeys.map((key, index) =>
      decryptedSecretVersions.filter(
        (secret: SecretDataProps) => secret.key === key && secret.type === "shared"
      )[0]?.id
        ? {
            id: decryptedSecretVersions.filter(
              (secret: SecretDataProps) => secret.key === key && secret.type === "shared"
            )[0].id,
            pos: index,
            key,
            environment: decryptedSecretVersions.filter(
              (secret: SecretDataProps) => secret.key === key && secret.type === "shared"
            )[0].environment,
            tags: decryptedSecretVersions.filter(
              (secret: SecretDataProps) => secret.key === key && secret.type === "shared"
            )[0].tags,
            value: decryptedSecretVersions.filter(
              (secret: SecretDataProps) => secret.key === key && secret.type === "shared"
            )[0]?.value,
            valueOverride: decryptedSecretVersions.filter(
              (secret: SecretDataProps) => secret.key === key && secret.type === "personal"
            )[0]?.value
          }
        : {
            id: decryptedSecretVersions.filter(
              (secret: SecretDataProps) => secret.key === key && secret.type === "personal"
            )[0].id,
            pos: index,
            key,
            environment: decryptedSecretVersions.filter(
              (secret: SecretDataProps) => secret.key === key && secret.type === "personal"
            )[0].environment,
            tags: decryptedSecretVersions.filter(
              (secret: SecretDataProps) => secret.key === key && secret.type === "personal"
            )[0].tags,
            value: decryptedSecretVersions.filter(
              (secret: SecretDataProps) => secret.key === key && secret.type === "shared"
            )[0]?.value,
            valueOverride: decryptedSecretVersions.filter(
              (secret: SecretDataProps) => secret.key === key && secret.type === "personal"
            )[0]?.value
          }
    );

    setSnapshotData({
      id: secretSnapshotData._id,
      version: secretSnapshotData.version,
      createdAt: secretSnapshotData.createdAt,
      secretVersions: result,
      comment: ""
    });
  };

  return (
    <div
      className={`min-w-sm absolute w-full max-w-sm border-l border-mineshaft-500 ${
        isLoading ? "bg-bunker-800" : "bg-bunker"
      } fixed sticky right-0 top-0 z-[40] flex h-full flex-col justify-between shadow-xl`}
    >
      {isLoading ? (
        <div className="mb-8 flex h-full items-center justify-center">
          <Image
            src="/images/loading/loading.gif"
            height={60}
            width={100}
            alt="infisical loading indicator"
          />
        </div>
      ) : (
        <div className="h-min">
          <div className="flex flex-row items-center justify-between border-b border-mineshaft-500 px-4 py-3">
            <p className="text-lg font-semibold text-bunker-200">Point In Recovery</p>
            <div
              onKeyDown={() => null}
              role="button"
              tabIndex={0}
              className="p-1"
              onClick={() => toggleSidebar(false)}
            >
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4 cursor-pointer text-bunker-300" />
            </div>
          </div>
          <div className="flex h-[calc(100vh-115px)] w-96 flex-col overflow-y-auto border-l border-mineshaft-600 bg-bunker px-2 py-2">
            <span className="px-2 pb-2 text-sm text-bunker-200">
              Note: This will recover secrets for all enviroments in this project.
            </span>
            {secretSnapshotsMetadata?.map((snapshot: SnaphotProps, id: number) => (
              <div
                onKeyDown={() => null}
                role="button"
                tabIndex={0}
                key={snapshot._id}
                onClick={() => exploreSnapshot({ snapshotId: snapshot._id })}
                className={`${
                  chosenSnapshot === snapshot._id || (id === 0 && chosenSnapshot === "")
                    ? "pointer-events-none bg-primary text-black"
                    : "cursor-pointer bg-mineshaft-700 duration-200 hover:bg-mineshaft-500"
                } mb-2 flex flex-row items-center justify-between rounded-md py-3 px-4`}
              >
                <div className="flex flex-row items-start">
                  <div
                    className={`${
                      chosenSnapshot === snapshot._id || (id === 0 && chosenSnapshot === "")
                        ? "text-bunker-800"
                        : "text-bunker-200"
                    } mr-1.5 text-sm`}
                  >
                    {timeSince(new Date(snapshot.createdAt))}
                  </div>
                  <div
                    className={`${
                      chosenSnapshot === snapshot._id || (id === 0 && chosenSnapshot === "")
                        ? "text-bunker-900"
                        : "text-bunker-300"
                    } text-sm `}
                  >{` - ${snapshot.secretVersions.length} Secrets`}</div>
                </div>
                <div
                  className={`${
                    chosenSnapshot === snapshot._id || (id === 0 && chosenSnapshot === "")
                      ? "pointer-events-none text-bunker-800"
                      : "cursor-pointer text-bunker-200 duration-200 hover:text-primary"
                  } text-sm`}
                >
                  {id === 0
                    ? "Current Version"
                    : chosenSnapshot === snapshot._id
                    ? "Currently Viewing"
                    : "Explore"}
                </div>
              </div>
            ))}
            <div className="mb-14 flex w-full justify-center">
              <div className="w-40 items-center">
                <Button
                  text="View More"
                  textDisabled="End of History"
                  active={secretSnapshotsMetadata.length % 15 === 0}
                  onButtonPressed={loadMoreSnapshots}
                  size="md"
                  color="mineshaft"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PITRecoverySidebar;
