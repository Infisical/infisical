import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";

import { decryptSymmetric } from "@app/components/utilities/cryptography/crypto";
import { useTimedReset } from "@app/hooks";
import { useGetActiveSharedSecretByIdAndHashedHex } from "@app/hooks/api/secretSharing";

import { DragonMainImage, SecretTable } from "./components";

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

  const [timeLeft, setTimeLeft] = useState("");
  const [isUrlCopied, , setIsUrlCopied] = useTimedReset<boolean>({
    initialState: false
  });

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const millisecondsPerHour = 1000 * 60 * 60;
  const millisecondsPerMinute = 1000 * 60;

  useEffect(() => {
    const updateTimer = () => {
      if (data) {
        if (data.expiresAt) {
          const expirationTime = new Date(data.expiresAt).getTime();
          const currentTime = new Date().getTime();
          const timeDifference = expirationTime - currentTime;

          if (timeDifference < 0) {
            setTimeLeft("Expired");
          } else {
            const hoursRemaining = Math.floor(
              (timeDifference % millisecondsPerDay) / millisecondsPerHour
            );
            const minutesRemaining = Math.floor(
              (timeDifference % millisecondsPerHour) / millisecondsPerMinute
            );
            const secondsRemaining = Math.floor((timeDifference % millisecondsPerMinute) / 1000);
            setTimeLeft(`${hoursRemaining}h ${minutesRemaining}m ${secondsRemaining}s`);
          }
        } else if (data.expiresAfterViews) {
          setTimeLeft(`${data.expiresAfterViews - 1} more views`);
        }
      }
    };

    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [data?.expiresAt]);

  useEffect(() => {
    if (isUrlCopied) {
      setTimeout(() => setIsUrlCopied(false), 2000);
    }
  }, [isUrlCopied]);

  const copyUrlToClipboard = () => {
    navigator.clipboard.writeText(decryptedSecret);
    setIsUrlCopied(true);
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
        A secret has been shared with you securely via Infisical
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
        </div>
      </div>
    </div>
  );
};
