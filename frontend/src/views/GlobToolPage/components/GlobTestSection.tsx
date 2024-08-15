import { useRouter } from 'next/router';
import Image from "next/image";
import Link from "next/link";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";

import { GlobToolFormSection } from './GlobToolFormSection';

export const GlobTestSection = () => {
  const router = useRouter();
  const { query } = router;
  const secretPath = decodeURIComponent(query.secretPath as string ?? '');

  return (
    <>
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
            className="mt-4 mb-6 max-w-md bg-gradient-to-b from-white to-bunker-200 bg-clip-text px-4 text-center text-3xl font-medium text-transparent"
          >
            Test glob patterns via Infisical
          </h1>
        </div>
        <div className="px-0 sm:px-6 sm:w-[40rem]">
          <GlobToolFormSection selectedPath={secretPath} />
        </div>
        </div>
      </div>

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
    </>
  );
};
