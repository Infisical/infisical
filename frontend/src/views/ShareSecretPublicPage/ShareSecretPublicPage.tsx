import { useEffect, useMemo } from "react";
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

  useEffect(() => {
    if (isUrlCopied) {
      setTimeout(() => setIsUrlCopied(false), 2000);
    }
  }, [isUrlCopied]);

  const copyUrlToClipboard = () => {
    navigator.clipboard.writeText(decryptedSecret);
    setIsUrlCopied(true);
  };
  const { popUp, handlePopUpToggle } = usePopUp(["createSharedSecret"] as const);

  return (
    <div className="h-screen dark:[color-scheme:dark] flex flex-col overflow-y-auto bg-gradient-to-tr from-mineshaft-700 to-bunker-800 text-gray-200">
      <Head>
        <title>Secret Shared | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="w-full flex flex-grow items-center justify-center dark:[color-scheme:dark]">
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
          <div className="w-full flex justify-center">
            <h1 className={`${id ? "max-w-sm mb-4": "max-w-md mt-4 mb-6"} bg-gradient-to-b from-white to-bunker-200 bg-clip-text px-4 text-center text-3xl font-medium text-transparent`}>
              {id ? "Someone shared a secret via Infisical with you" : "Share a secret via Infisical"}
            </h1>
          </div>
          <div className="m-auto mt-4 flex w-full max-w-2xl justify-center px-6">
            {id && (
              <SecretTable
                isLoading={isLoading}
                decryptedSecret={decryptedSecret}
                isUrlCopied={isUrlCopied}
                copyUrlToClipboard={copyUrlToClipboard}
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
                  className="bg-mineshaft-700 text-bunker-200 w-full py-3"
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
          <div className="m-auto my-6 flex w-full max-w-xl justify-center px-8 px-4 sm:my-8">
            <div className="w-full border-t border-mineshaft-600" />
          </div>
          <div className="flex flex-col justify-center items-center m-auto max-w-2xl px-4 sm:px-6">
            <div className="m-auto mb-12 flex flex max-w-2xl w-full flex-col justify-center rounded-md border border-primary-500/30 bg-primary/5 p-6 pt-5">
              <p className="pb-2 font-semibold text-mineshaft-100 md:pb-3 text-lg md:text-xl w-full">
                Open source <span className="bg-clip-text text-transparent bg-gradient-to-tr from-yellow-500 to-primary-500">secret management</span> for developers
              </p>
              <div className="flex flex-col sm:flex-row gap-x-4">
                <p className="md:text-md text-md">
                  <a
                    href="https://github.com/infisical/infisical"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-clip-text text-transparent bg-gradient-to-tr from-yellow-500 to-primary-500 text-bold"
                  >
                    Infisical
                  </a>{" "} is the all-in-one secret management platform to securely manage secrets, configs, and certificates across your team and infrastructure.
                </p>
                <Link href="https://infisical.com">
                  <span className="mt-4 border border-mineshaft-400/40 w-[17.5rem] h-min py-2 px-3 rounded-md bg-mineshaft-600 cursor-pointer duration-200 hover:text-white hover:border-primary/60 hover:bg-primary/20">
                    Try Infisical <FontAwesomeIcon icon={faArrowRight} className="pl-1"/>
                  </span>
                </Link>
              </div>
            </div>
          </div>
          <AddShareSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} isPublic inModal />
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
