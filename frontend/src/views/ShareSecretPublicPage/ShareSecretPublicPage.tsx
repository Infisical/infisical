import { useEffect, useMemo } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { decryptSymmetric } from "@app/components/utilities/cryptography/crypto";
import { useTimedReset } from "@app/hooks";
import { useGetActiveSharedSecretByIdAndHashedHex } from "@app/hooks/api/secretSharing";

import { SecretTable } from "./components";

export const ShareSecretPublicPage = () => {
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
  // const { popUp, handlePopUpToggle } = usePopUp(["createSharedSecret"] as const);

  return (
    <div className="h-screen bg-gradient-to-tr from-mineshaft-700 to-bunker-800 text-gray-200">
      <Head>
        <title>Secret Shared | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex-col items-center justify-center h-screen w-full overflow-y-auto dark:[color-scheme:dark]">
        <Link href="https://infisical.com">
          <div className="mb-4 flex justify-center pt-8 md:pt-0 sm:mt-28">
            <Image src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical logo" />
          </div>
        </Link>
        <h1 className="mt-6 mb-4 bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-2xl font-medium text-transparent px-4">
          {id ? "Someone shared a secret on Infisical with you." : "Share Secrets with Infisical"}
        </h1>
        <div className="flex max-w-xl w-full mt-8 flex justify-center m-auto px-4">
          {id && (
            <SecretTable
              isLoading={isLoading}
              decryptedSecret={decryptedSecret}
              isUrlCopied={isUrlCopied}
              copyUrlToClipboard={copyUrlToClipboard}
            />
          )}
        </div>

        <div className="my-6 sm:my-10 max-w-xl w-full px-8 flex justify-center m-auto px-4"> 
          <div className="border-t border-mineshaft-600 w-full"/> 
        </div>

        <div className="max-w-xl m-auto px-4">
          <div className="flex flex-col rounded-md gap-2 max-w-xl border bg-primary/5 p-6 border-primary-500/30 mb-8 sm:mb-20 flex justify-center m-auto">
            <p className="pb-2 font-semibold text-mineshaft-100 md:pb-4 md:text-xl">
              Safe, Secure, & Open Source
            </p>
            <p className="md:text-md text-sm">
              Infisical is the <a
                href="https://github.com/infisical/infisical"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                open source
              </a> secrets management platform for developers. <br className="hidden md:inline" />
              <div className="pb-2"/>
              Infisical Secret Sharing uses end-to-end encrypted architecture to ensure that
              your secrets are truly private (even from us).
            </p>
            <Link href="https://infisical.com"><span className="hover:text-primary duration-200 cursor-pointer mt-4">Learn More <FontAwesomeIcon icon={faArrowRight} /></span></Link>
          </div>
        </div>

        {/* <div className="flex flex-1 flex-col items-center justify-center px-4">
          <div className="pt-20">
            <AddShareSecretModal
              popUp={popUp}
              handlePopUpToggle={handlePopUpToggle}
              isPublic
              inModal={false}
            />
          </div>
        </div> */}
        <div className="sm:absolute bottom-0 w-full bg-mineshaft-600 flex items-center justify-center p-2">
          <p className="text-center text-sm text-mineshaft-300">
            © 2024{" "}
            <a className="text-primary" href="https://infisical.com">
              Infisical
            </a>. All rights reserved.
            <br />
            156 2nd st, 3rd Floor, San Francisco, California, 94105, United States. 🇺🇸
          </p>
        </div>
      </div>
    </div>
  );
};
