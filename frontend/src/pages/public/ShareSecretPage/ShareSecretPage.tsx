import { Helmet } from "react-helmet";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ShareSecretForm } from "./components";

export const ShareSecretPage = () => {
  return (
    <>
      <Helmet>
        <title>Securely Share Secrets | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="" />
        <meta name="og:description" content="" />
      </Helmet>
      <div className="dark h-full">
        <div className="bg-linear-to-tr from-mineshaft-700 to-bunker-800 dark:scheme-dark flex h-screen flex-col justify-between overflow-auto text-gray-200">
          <div />
          <div className="mx-auto w-full max-w-xl px-4 py-4 md:px-0">
            <div className="mb-8 text-center">
              <div className="mb-4 flex justify-center pt-8">
                <a target="_blank" rel="noopener noreferrer" href="https://infisical.com">
                  <img
                    src="/images/gradientLogo.svg"
                    height={90}
                    width={120}
                    alt="Infisical logo"
                    className="cursor-pointer"
                  />
                </a>
              </div>
              <h1 className="bg-linear-to-b to-bunker-200 from-white bg-clip-text text-center text-4xl font-medium text-transparent">
                Share a secret
              </h1>
              <p className="text-md">
                Powered by{" "}
                <a
                  href="https://github.com/infisical/infisical"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bold bg-linear-to-tr to-primary-500 from-yellow-500 bg-clip-text text-transparent"
                >
                  Infisical &rarr;
                </a>
              </p>
            </div>
            <div className="border-mineshaft-600 bg-mineshaft-800 rounded-lg border p-4">
              <ShareSecretForm isPublic />
            </div>
            <div className="m-auto my-8 flex w-full">
              <div className="border-mineshaft-600 w-full border-t" />
            </div>
            <div className="border-primary-500/30 bg-primary/5 m-auto flex w-full flex-col rounded-md border p-6 pt-5">
              <p className="text-mineshaft-100 w-full pb-2 text-lg font-medium md:pb-3 md:text-xl">
                Open source{" "}
                <span className="bg-linear-to-tr to-primary-500 from-yellow-500 bg-clip-text text-transparent">
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
                    className="text-bold bg-linear-to-tr to-primary-500 from-yellow-500 bg-clip-text text-transparent"
                  >
                    Infisical
                  </a>{" "}
                  is the all-in-one secret management platform to securely manage secrets, configs,
                  and certificates across your team and infrastructure.
                </p>
                <div className="mt-4 cursor-pointer sm:mt-0">
                  <a target="_blank" rel="noopener noreferrer" href="https://infisical.com">
                    <div className="border-mineshaft-400/40 bg-mineshaft-600 hover:border-primary/60 hover:bg-primary/20 flex items-center justify-between rounded-md border px-3 py-2 duration-200 hover:text-white">
                      <p className="mr-4 whitespace-nowrap">Try Infisical</p>
                      <FontAwesomeIcon icon={faArrowRight} />
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-mineshaft-600 w-full p-2">
            <p className="text-mineshaft-300 text-center text-sm">
              Made with ❤️ by{" "}
              <a className="text-primary" href="https://infisical.com">
                Infisical
              </a>
              <br />
              235 2nd st, San Francisco, California, 94105, United States. 🇺🇸
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
