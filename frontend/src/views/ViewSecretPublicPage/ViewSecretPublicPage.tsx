import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useGetActiveSharedSecretById } from "@app/hooks/api/secretSharing";

import { SecretContainer, SecretErrorContainer } from "./components";

export const ViewSecretPublicPage = () => {
  const router = useRouter();
  const { id, key: urlEncodedPublicKey } = router.query;

  const [hashedHex, key] = urlEncodedPublicKey
    ? urlEncodedPublicKey.toString().split("-")
    : ["", ""];

  const { data: secret, error } = useGetActiveSharedSecretById({
    sharedSecretId: id as string,
    hashedHex
  });

  return (
    <div className="flex h-screen flex-col justify-between overflow-auto bg-gradient-to-tr from-mineshaft-700 to-bunker-800 text-gray-200 dark:[color-scheme:dark]">
      <div />
      <div className="mx-auto w-full max-w-xl px-4 py-4 md:px-0">
        <div className="mb-8 text-center">
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
          <h1 className="bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-4xl font-medium text-transparent">
            View shared secret
          </h1>
          <p className="text-md">
            Powered by{" "}
            <a
              href="https://github.com/infisical/infisical"
              target="_blank"
              rel="noopener noreferrer"
              className="text-bold bg-gradient-to-tr from-yellow-500 to-primary-500 bg-clip-text text-transparent"
            >
              Infisical &rarr;
            </a>
          </p>
        </div>
        {secret && key && <SecretContainer secret={secret} secretKey={key} />}
        {error && <SecretErrorContainer />}
        <div className="m-auto my-8 flex w-full">
          <div className="w-full border-t border-mineshaft-600" />
        </div>
        <div className="m-auto flex w-full flex-col rounded-md border border-primary-500/30 bg-primary/5 p-6 pt-5">
          <p className="w-full pb-2 text-lg font-semibold text-mineshaft-100 md:pb-3 md:text-xl">
            Open source{" "}
            <span className="bg-gradient-to-tr from-yellow-500 to-primary-500 bg-clip-text text-transparent">
              secret management
            </span>{" "}
            for developers
          </p>
          <div className="flex flex-col items-start sm:flex-row sm:items-center">
            <p className="md:text-md text-md mr-4">
              <a
                href="https://github.com/infisical/infisical"
                target="_blank"
                rel="noopener noreferrer"
                className="text-bold bg-gradient-to-tr from-yellow-500 to-primary-500 bg-clip-text text-transparent"
              >
                Infisical
              </a>{" "}
              is the all-in-one secret management platform to securely manage secrets, configs, and
              certificates across your team and infrastructure.
            </p>
            <div className="mt-4 cursor-pointer sm:mt-0">
              <Link href="https://infisical.com">
                <div className="flex items-center justify-between rounded-md border border-mineshaft-400/40 bg-mineshaft-600 py-2 px-3 duration-200 hover:border-primary/60 hover:bg-primary/20 hover:text-white">
                  <p className="mr-4 whitespace-nowrap">Try Infisical</p>
                  <FontAwesomeIcon icon={faArrowRight} />
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="w-full bg-mineshaft-600 p-2">
        <p className="text-center text-sm text-mineshaft-300">
          Made with ❤️ by{" "}
          <a className="text-primary" href="https://infisical.com">
            Infisical
          </a>
          <br />
          156 2nd st, 3rd Floor, San Francisco, California, 94105, United States. 🇺🇸
        </p>
      </div>
    </div>
  );
};
