import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import {
  decryptAssymmetric,
  decryptSymmetric
} from '@app/components/utilities/cryptography/crypto';
import getSecretVersions from '@app/ee/api/secrets/GetSecretVersions';
import getLatestFileKey from '@app/pages/api/workspace/getLatestFileKey';
import { faCircle, faDotCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

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
    <div className="w-full h-52 px-4 mt-4 text-sm text-bunker-300 overflow-x-none">
      <p className="">{t('dashboard:sidebar.version-history')}</p>
      <div className="p-1 rounded-md bg-bunker-800 border border-mineshaft-500 overflow-x-none h-full">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Image
              src="/images/loading/loading.gif"
              height={60}
              width={100}
              alt="infisical loading indicator"
            />
          </div>
        ) : (
          <div className="h-48 overflow-y-auto overflow-x-none">
            {secretVersions ? (
              secretVersions
                ?.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((version: DecryptedSecretVersionListProps, index: number) => (
                  <div key={`${version.createdAt}.${index + 1}`} className="flex flex-row">
                    <div className="pr-1 flex flex-col items-center">
                      <div className="p-1">
                        <FontAwesomeIcon icon={index === 0 ? faDotCircle : faCircle} />
                      </div>
                      <div className="w-0 h-full border-l mt-1" />
                    </div>
                    <div className="flex flex-col w-full max-w-[calc(100%-2.3rem)]">
                      <div className="pr-2 pt-1">
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
                        <p className="break-words">
                          <span className="py-0.5 px-1 rounded-md bg-primary-200/10 mr-1.5">
                            Value:
                          </span>
                          {version.value}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
            ) : (
              <div className="w-full h-full flex items-center justify-center text-bunker-400">
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
