import { useMemo } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { decryptSymmetric } from "@app/components/utilities/cryptography/crypto";
import { Button } from "@app/components/v2";
import { usePopUp, useTimedReset } from "@app/hooks";
import { useGetActiveSharedSecretByIdAndHashedHex } from "@app/hooks/api/secretSharing";

import { AddShareSecretModal } from "../ShareSecretPage/components/AddShareSecretModal";
import { SecretTable } from "./components";

export const ShareSecretPublicPage = ({ isNewSession }: { isNewSession: boolean }) => {
  const router = useRouter();
  const { id, key: urlEncodedPublicKey } = router.query;
  const [hashedHex, key] = urlEncodedPublicKey
    ? urlEncodedPublicKey.toString().split("-")
    : ["", ""];

  const publicKey = decodeURIComponent(urlEncodedPublicKey as string);
  const { isLoading, data } = useGetActiveSharedSecretByIdAndHashedHex(
    id as string,
    hashedHex as string
  );
  const accessType = data?.accessType;
  const orgName = data?.orgName;

  const decryptedSecret = useMemo(() => {
    if (data && data.encryptedValue && publicKey) {
      const res = decryptSymmetric({
        ciphertext: data.encryptedValue,
        iv: data.iv,
        tag: data.tag,
        key
      });
      return res;
    }
    return "";
  }, [data, publicKey]);

  const [isUrlCopied, , setIsUrlCopied] = useTimedReset<boolean>({
    initialState: false
  });

  const copyUrlToClipboard = () => {
    navigator.clipboard.writeText(decryptedSecret);
    setIsUrlCopied(true);
  };
  const { popUp, handlePopUpToggle } = usePopUp(["createSharedSecret"] as const);

  return (
    <div className="flex h-screen flex-col overflow-y-auto bg-gradient-to-tr from-mineshaft-700 to-bunker-800 text-gray-200 dark:[color-scheme:dark]">
      <Head>
        <title>Secret Shared | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex w-full flex-grow items-center justify-center dark:[color-scheme:dark]">
        <div className="relative">
          <div className="mb-4 flex justify-center pt-8">
            <Link href="https://infisical.com">
              <Image
                src="/images/gradientLogo.svg"
                height={90}
                width={120}
                alt="Infisical logo"
                className="cursor-pointer"
              />
            </Link>
          </div>
          <div className="flex w-full justify-center">
            <h1
              className={`${
                id ? "mb-4 max-w-sm" : "mt-4 mb-6 max-w-md"
              } bg-gradient-to-b from-white to-bunker-200 bg-clip-text px-4 text-center text-3xl font-medium text-transparent`}
            >
              {id
                ? "Someone shared a secret via Infisical with you"
                : "Share a secret via Infisical"}
            </h1>
          </div>
          <div className="m-auto mt-4 flex w-full max-w-2xl justify-center px-6">
            {id && (
              <SecretTable
                isLoading={isLoading}
                decryptedSecret={decryptedSecret}
                isUrlCopied={isUrlCopied}
                copyUrlToClipboard={copyUrlToClipboard}
                accessType={accessType}
                orgName={orgName}
              />
            )}
          </div>

          {isNewSession && (
            <div className="px-0 sm:px-6">
              <AddShareSecretModal
                popUp={popUp}
                handlePopUpToggle={handlePopUpToggle}
                inModal={false}
                isPublic
              />
            </div>
          )}
          {!isNewSession && (
            <div className="flex flex-1 flex-col items-center justify-center px-6 pt-4">
              <a
                href="https://share.infisical.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 w-full text-sm font-normal leading-[1.2rem] text-mineshaft-300 hover:text-mineshaft-100"
              >
                <Button
                  className="w-full bg-mineshaft-700 py-3 text-bunker-200"
                  colorSchema="primary"
                  variant="outline_bg"
                  size="sm"
                  onClick={() => {}}
                  rightIcon={<FontAwesomeIcon icon={faArrowRight} className="pl-2" />}
                >
                  Share your own Secret
                </Button>
              </a>
            </div>
          )}
          <div className="m-auto my-6 flex w-full max-w-xl justify-center px-4 sm:my-8">
            <div className="w-full border-t border-mineshaft-600" />
          </div>
          <div className="m-auto flex max-w-2xl flex-col items-center justify-center px-4 sm:px-6">
            <div className="m-auto mb-12 flex w-full max-w-2xl flex-col justify-center rounded-md border border-primary-500/30 bg-primary/5 p-6 pt-5">
              <p className="w-full pb-2 text-lg font-semibold text-mineshaft-100 md:pb-3 md:text-xl">
                Open source{" "}
                <span className="bg-gradient-to-tr from-yellow-500 to-primary-500 bg-clip-text text-transparent">
                  secret management
                </span>{" "}
                for developers
              </p>
              <div className="flex flex-col gap-x-4 sm:flex-row">
                <p className="md:text-md text-md">
                  <a
                    href="https://github.com/infisical/infisical"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-bold bg-gradient-to-tr from-yellow-500 to-primary-500 bg-clip-text text-transparent"
                  >
                    Infisical
                  </a>{" "}
                  is the all-in-one secret management platform to securely manage secrets, configs,
                  and certificates across your team and infrastructure.
                </p>
                <Link href="https://infisical.com">
                  <span className="mt-4 h-min w-[17.5rem] cursor-pointer rounded-md border border-mineshaft-400/40 bg-mineshaft-600 py-2 px-3 duration-200 hover:border-primary/60 hover:bg-primary/20 hover:text-white">
                    Try Infisical <FontAwesomeIcon icon={faArrowRight} className="pl-1" />
                  </span>
                </Link>
              </div>
            </div>
          </div>
          <AddShareSecretModal
            popUp={popUp}
            handlePopUpToggle={handlePopUpToggle}
            isPublic
            inModal
          />
        </div>
      </div>
      <div className="mt-auto flex w-full items-center justify-center bg-mineshaft-600 p-2">
        <p className="text-center text-sm text-mineshaft-300">
          © 2024{" "}
          <a className="text-primary" href="https://infisical.com">
            Infisical
          </a>
          . All rights reserved.
          <br />
          156 2nd st, 3rd Floor, San Francisco, California, 94105, United States. 🇺🇸
        </p>
      </div>
    </div>
  );
};
