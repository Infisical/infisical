import Link from "next/link";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ShareSecretSection } from "./components";

export const ShareSecretPage = () => {
  return (
    <div className="container mx-auto h-full w-full max-w-7xl bg-bunker-800 px-6 text-white">
      <div className="flex items-center justify-between py-6">
        <div className="flex w-full flex-col">
          <h2 className="text-3xl font-semibold text-gray-200">Secret Sharing</h2>
          <p className="text-bunker-300">Share secrets securely using a shareable link</p>
        </div>
        <div className="flex w-max justify-center">
          <Link href="https://infisical.com/docs/documentation/platform/secret-sharing" passHref>
          <a target="_blank" rel="noopener noreferrer">
            <div className="w-max cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white">
              Documentation{" "}
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="mb-[0.06rem] ml-1 text-xs"
              />
            </div>
            </a>
          </Link>
        </div>
      </div>
      <ShareSecretSection />
    </div>
  );
};
