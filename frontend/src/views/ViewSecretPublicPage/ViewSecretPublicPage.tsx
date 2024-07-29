import { useRouter } from "next/router";

import { useGetActiveSharedSecretById } from "@app/hooks/api/secretSharing";

import { SecretContainer, SecretErrorContainer } from "./components";

export const ViewSecretPublicPage = () => {
  const router = useRouter();
  const { id, key: urlEncodedPublicKey } = router.query;
  const key = decodeURIComponent(urlEncodedPublicKey as string);

  const { data: secret, error } = useGetActiveSharedSecretById(id as string);

  return (
    <div className="flex h-screen flex-col justify-between bg-gradient-to-tr from-mineshaft-700 to-bunker-800 text-gray-200 dark:[color-scheme:dark]">
      <div />
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="bg-gradient-to-b from-white to-bunker-200 bg-clip-text px-4 text-center text-3xl font-medium text-transparent">
            View Shared Secret
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
      </div>
      <div className="w-full bg-mineshaft-600 p-2">
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
