import { useEffect, useMemo } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowRight, faPlus } from "@fortawesome/free-solid-svg-icons";
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
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["createSharedSecret"] as const);

  return (
    <div className="h-screen bg-gradient-to-tr from-mineshaft-700 to-bunker-800 text-gray-200">
      <Head>
        <title>Secret Shared | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="h-screen w-full flex-col items-center justify-center dark:[color-scheme:dark]">
        <div className="mb-4 flex justify-center pt-8 md:pt-16">
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
        <h1 className="mt-6 mb-4 bg-gradient-to-b from-white to-bunker-200 bg-clip-text px-4 text-center text-2xl font-medium text-transparent">
          {id ? "Someone shared a secret on Infisical with you." : "Share Secrets with Infisical"}
        </h1>
        <div className="m-auto mt-8 flex w-full max-w-xl justify-center px-4">
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
          <AddShareSecretModal
            popUp={popUp}
            handlePopUpToggle={handlePopUpToggle}
            inModal={false}
            isPublic
          />
        )}

        <div className="m-auto my-6 flex w-full max-w-xl justify-center px-8 px-4 sm:my-10">
          <div className="w-full border-t border-mineshaft-600" />
        </div>

        <div className="m-auto max-w-xl px-4">
          <div className="m-auto mb-8 flex flex max-w-xl flex-col justify-center gap-2 rounded-md border border-primary-500/30 bg-primary/5 p-6">
            <p className="pb-2 font-semibold text-mineshaft-100 md:pb-4 md:text-xl">
              Safe, Secure, & Open Source
            </p>
            <p className="md:text-md text-sm">
              Infisical is the{" "}
              <a
                href="https://github.com/infisical/infisical"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                open source
              </a>{" "}
              secrets management platform for developers. <br className="hidden md:inline" />
              <div className="pb-2" />
              Infisical Secret Sharing uses end-to-end encrypted architecture to ensure that your
              secrets are truly private (even from us).
            </p>
            <Link href="https://infisical.com">
              <span className="mt-4 cursor-pointer duration-200 hover:text-primary">
                Learn More <FontAwesomeIcon icon={faArrowRight} />
              </span>
            </Link>
          </div>
          {!isNewSession && (
            <div className="flex flex-1 flex-col items-center justify-center px-4">
              <Button
                className="bg-mineshaft-700 text-bunker-200"
                colorSchema="primary"
                variant="outline_bg"
                size="sm"
                onClick={() => {
                  handlePopUpOpen("createSharedSecret");
                }}
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
              >
                Share your own Secret
              </Button>
            </div>
          )}
        </div>
        <div className="bottom-0 flex w-full items-center justify-center bg-mineshaft-600 p-2 sm:absolute">
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
        <AddShareSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} isPublic inModal />
      </div>
    </div>
  );
};
