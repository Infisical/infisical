import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";

import { openSignedAssymmetric } from "@app/components/utilities/cryptography/crypto";
import { useToggle } from "@app/hooks";
import { useGetActiveSharedSecretById } from "@app/hooks/api/secretSharing";

import { DragonMainImage, SecretTable } from "./components";

export const ShareSecretPublicPage = () => {
  const router = useRouter();
  const { id, key: urlEncodedPublicKey } = router.query;

  const publicKey = decodeURIComponent(urlEncodedPublicKey as string);
  useEffect(() => {
    if (!id || !publicKey) {
      router.push("/404");
    }
  }, [id, publicKey]);

  const { isLoading, data } = useGetActiveSharedSecretById(id as string);
  const decryptedSecret = useMemo(() => {
    if (data && data.signedValue && publicKey) {
      const res = openSignedAssymmetric({
        signedMessage: data.signedValue,
        publicKey: publicKey as string
      });
      return res;
    }
    return "";
  }, [data, publicKey]);

  const [timeLeft, setTimeLeft] = useState("");
  const [isUrlCopied, setIsUrlCopied] = useToggle(false);

  useEffect(() => {
    const updateTimer = () => {
      if (data && data.expiresAt) {
        const expiryDate = new Date(data.expiresAt).getTime();
        const now = new Date().getTime();
        const distance = expiryDate - now;

        if (distance < 0) {
          setTimeLeft("Expired");
        } else {
          const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((distance % (1000 * 60)) / 1000);
          setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
        }
      }
    };

    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [data?.expiresAt]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isUrlCopied) {
      timer = setTimeout(() => setIsUrlCopied.off(), 2000);
    }

    return () => clearTimeout(timer);
  }, [isUrlCopied]);

  const copyUrlToClipboard = () => {
    navigator.clipboard.writeText(decryptedSecret as string);
    setIsUrlCopied.on();
  };

  return (
    <div className="flex flex-col justify-between bg-bunker-800 text-gray-200 md:h-screen">
      <Head>
        <title>Secret Shared | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>

      <div className="my-4 flex justify-center md:my-8">
        <Image src="/images/biglogo.png" height={180} width={240} alt="Infisical logo" />
      </div>
      <p className="mb-6 px-8 text-center text-xl md:px-0 md:text-3xl">
        You’ve been shared a secret securely with Infisical.
      </p>
      <div className="flex min-h-screen w-full flex-col md:flex-row">
        <DragonMainImage />
        <div className="m-4 flex flex-1 flex-col items-center justify-start md:m-0">
          <p className="mt-8 mb-2 text-xl font-semibold text-mineshaft-100 md:mt-20">
            Secret Details
          </p>
          <div className="mb-16 rounded-lg border border-mineshaft-600 bg-mineshaft-900 md:p-8">
            <SecretTable
              isLoading={isLoading}
              sharedSecret={data}
              decryptedSecret={decryptedSecret}
              timeLeft={timeLeft}
              isUrlCopied={isUrlCopied}
              copyUrlToClipboard={copyUrlToClipboard}
            />
          </div>
          <Link href="/">
            <a className="mt-4 cursor-pointer rounded-md bg-mineshaft-500 py-2 px-4 text-lg font-semibold duration-200 hover:bg-primary hover:text-black">
              Check Infisical out now!
            </a>
          </Link>
        </div>
      </div>
    </div>
  );
};
