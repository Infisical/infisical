import { useEffect, useMemo } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { decryptSymmetric } from "@app/components/utilities/cryptography/crypto";
import { Button } from "@app/components/v2";
import { usePopUp, useTimedReset } from "@app/hooks";
import { useGetActiveSharedSecretByIdAndHashedHex } from "@app/hooks/api/secretSharing";

import { AddShareSecretModal } from "../ShareSecretPage/components/AddShareSecretModal";
import { SecretTable } from "./components";

export const ShareSecretPublicPage = () => {
  const router = useRouter();
  const { id, key: urlEncodedPublicKey } = router.query;
  const [hashedHex, key] = urlEncodedPublicKey!.toString().split("-");

  const publicKey = decodeURIComponent(urlEncodedPublicKey as string);
  useEffect(() => {
    if (!id || !publicKey) {
      router.push("/404");
    }
  }, [id, publicKey]);

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
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["createSharedSecret"] as const);

  return (
    <div className="flex h-screen flex-col bg-bunker-800 text-gray-200">
      <Head>
        <title>Secret Shared | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>

      <div className="flex items-center justify-center p-4">
        <Link href="https://infisical.com">
          <Image
            src="/images/biglogo.png"
            height={60}
            width={80}
            alt="Infisical logo"
            className="cursor-pointer"
          />
        </Link>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="flex w-full max-w-4xl flex-col items-center gap-4 md:gap-20">
          <p className="text-center text-xl font-semibold text-gray-200 md:text-3xl">
            Secret Shared via Infisical
          </p>
          <div className="flex w-full flex-grow flex-col gap-6 md:flex-row md:gap-12">
            <div className="flex-1 self-center pt-4 text-center md:pt-0 md:text-left">
              <p className="pb-2 font-semibold text-mineshaft-100 md:pb-4 md:text-xl">
                Safe & Secure
              </p>
              <p className="md:text-md text-sm">
                Infisical uses <span className="text-primary">Zero Knowledge</span> to ensure that
                your secrets are truly private (even from us).
              </p>
            </div>
            <div className="flex-1 rounded-lg p-2">
              <SecretTable
                isLoading={isLoading}
                decryptedSecret={decryptedSecret}
                isUrlCopied={isUrlCopied}
                copyUrlToClipboard={copyUrlToClipboard}
              />
            </div>
            <div className="flex-1 self-center text-center md:text-right">
              <p className="pb-2 font-semibold text-mineshaft-100 md:pb-4 md:text-xl">
                Open Source
              </p>
              <p className="md:text-md text-sm">
                Infisical is open source. <br className="hidden md:inline" />
                Check us out on{" "}
                <a
                  href="https://github.com/infisical/infisical"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary"
                >
                  GitHub
                </a>
                .
              </p>
            </div>
          </div>
          <Button
            className="mt-4 max-w-[600px] md:mt-0"
            colorSchema="primary"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={() => {
              handlePopUpOpen("createSharedSecret");
            }}
          >
            Share your own Secret
          </Button>
        </div>
      </div>
      <AddShareSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} isPublic />
      <div className="flex items-center justify-center p-4">
        <p className="text-center text-sm text-gray-200">
          Developed by{" "}
          <a className="text-primary" href="https://infisical.com">
            Infisical
          </a>
          <br />
          Open Source Secret Management{" "}
        </p>
      </div>
    </div>
  );
};
