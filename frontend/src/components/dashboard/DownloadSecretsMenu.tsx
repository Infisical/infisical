import { Fragment } from "react";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
import { Menu, Transition } from "@headlessui/react";
import { SecretDataProps } from "public/data/frequentInterfaces";

import Button from "../basic/buttons/Button";
import downloadDotEnv from "../utilities/secrets/downloadDotEnv";
import downloadYaml from "../utilities/secrets/downloadYaml";

/**
 * This is the menu that is used to download secrets as .env ad .yml files (in future we may have more options)
 * @param {object} obj
 * @param {SecretDataProps[]} obj.data - secrets that we want to downlaod
 * @param {string} obj.env - the environment which we're downloading (used for naming the file)
 */
const DownloadSecretMenu = ({ data, env }: { data: SecretDataProps[]; env: string }) => {
  return (
    <Menu as="div" className="relative inline-block text-left">
      <Menu.Button
        as="div"
        className="inline-flex w-full justify-center text-sm font-medium text-gray-200 rounded-md hover:bg-white/10 duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
      >
        <Button color="mineshaft" size="icon-md" icon={faDownload} onButtonPressed={() => {}} />
      </Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute z-[90] drop-shadow-xl right-0 mt-0.5 w-[12rem] origin-top-right rounded-md bg-bunker border border-mineshaft-500 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none p-2 space-y-2">
          <Menu.Item>
            <Button
              color="mineshaft"
              onButtonPressed={() => downloadDotEnv({ data, env })}
              size="md"
              text="Download as .env"
            />
          </Menu.Item>
          <Menu.Item>
            <Button
              color="mineshaft"
              onButtonPressed={() => downloadYaml({ data, env })}
              size="md"
              text="Download as .yml"
            />
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  );
};

export default DownloadSecretMenu;
