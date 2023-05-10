import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { faCircle, faDotCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import {
  decryptAssymmetric,
  decryptSymmetric
} from '@app/components/utilities/cryptography/crypto';
import getSecretVersions from '@app/ee/api/secrets/GetSecretVersions';
import getLatestFileKey from '@app/pages/api/workspace/getLatestFileKey';

interface DecryptedSecretVersionListProps {
  createdAt: string;
  value: string;
}

interface EncrypetedSecretVersionListProps {
  createdAt: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
}

/**
 * @param {string} secretId - the id of a secret for which are querying version history
 * @returns a list of versions for a specific secret
 */
const SecretVersionList = ({ secretId }: { secretId: string }) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();
  const [secretVersions, setSecretVersions] = useState<DecryptedSecretVersionListProps[]>([]);

  useEffect(() => {
    const getSecretVersionHistory = async () => {
      setIsLoading(true);
      try {
        const encryptedSecretVersions = await getSecretVersions({ secretId, offset: 0, limit: 10 });
        const latestKey = await getLatestFileKey({ workspaceId: String(router.query.id) });

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

        const decryptedSecretVersions = encryptedSecretVersions?.secretVersions.map(
          (encryptedSecretVersion: EncrypetedSecretVersionListProps) => ({
            createdAt: encryptedSecretVersion.createdAt,
            value: decryptSymmetric({
              ciphertext: encryptedSecretVersion.secretValueCiphertext,
              iv: encryptedSecretVersion.secretValueIV,
              tag: encryptedSecretVersion.secretValueTag,
              key: decryptedLatestKey
            })
          })
        );

        setSecretVersions(decryptedSecretVersions);
        setIsLoading(false);
      } catch (error) {
        console.log(error);
      }
    };
    getSecretVersionHistory();
  }, [secretId]);

  return (
    <div className="min-w-40 overflow-x-none dark mt-4 h-[12.4rem] w-full px-4 text-sm text-bunker-300">
      <p className="">{t('dashboard.sidebar.version-history')}</p>
      <div className="overflow-x-none h-full rounded-md border border-mineshaft-500 bg-bunker-800 py-0.5 pl-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Image
              src="/images/loading/loading.gif"
              height={60}
              width={100}
              alt="infisical loading indicator"
            />
          </div>
        ) : (
          <div className="overflow-x-none h-48 overflow-y-auto dark:[color-scheme:dark]">
            {secretVersions ? (
              secretVersions
                ?.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((version: DecryptedSecretVersionListProps, index: number) => (
                  <div key={`${version.createdAt}.${index + 1}`} className="flex flex-row">
                    <div className="flex flex-col items-center pr-1">
                      <div className="p-1">
                        <FontAwesomeIcon icon={index === 0 ? faDotCircle : faCircle} />
                      </div>
                      <div className="mt-1 h-full w-0 border-l border-bunker-300" />
                    </div>
                    <div className="flex w-full max-w-[calc(100%-2.3rem)] flex-col">
                      <div className="pr-2 text-bunker-300/90">
                        {new Date(version.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </div>
                      <div className="">
                        <p className="ph-no-capture break-words">
                          <span className="mr-1.5 rounded-sm bg-primary-500/30 py-0.5 px-1">
                            Value:
                          </span>
                          <span className="font-mono">{version.value}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))
            ) : (
              <div className="flex h-full w-full items-center justify-center text-bunker-400">
                No version history yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SecretVersionList;
