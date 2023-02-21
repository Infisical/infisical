import { Fragment, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { faShuffle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Menu, Transition } from '@headlessui/react';

/**
 * This is the menu that is used to (re)generate secrets (currently we only have ranom hex, in future we will have more options)
 * @returns the popup-menu for randomly generating secrets
 */
const GenerateSecretMenu = ({
  modifyValue,
  id
}: {
  modifyValue: (value: string, id: string) => void;
  id: string;
}) => {
  const [randomStringLength, setRandomStringLength] = useState(32);
  const { t } = useTranslation();

  return (
    <Menu as="div" className="relative inline-block text-left">
      <div>
        <Menu.Button className="inline-flex w-full justify-center text-sm font-medium text-gray-200 rounded-md hover:bg-white/10 duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75">
          <div className="py-1 px-2 rounded-md bg-bunker-800 hover:bg-bunker-500">
            <FontAwesomeIcon icon={faShuffle} className="text-bunker-300" />
          </div>
        </Menu.Button>
      </div>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute z-50 drop-shadow-xl right-0 mt-0.5 w-[20rem] origin-top-right rounded-md bg-bunker border border-mineshaft-500 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none px-1 py-1">
          <div
            onKeyDown={() => null}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (randomStringLength > 32) {
                setRandomStringLength(32);
              } else if (randomStringLength < 2) {
                setRandomStringLength(2);
              } else {
                modifyValue(
                  [...Array(randomStringLength)]
                    .map(() => Math.floor(Math.random() * 16).toString(16))
                    .join(''),
                  id
                );
              }
            }}
            className="relative flex flex-row justify-start items-center cursor-pointer select-none py-2 px-2 rounded-md text-gray-400 hover:bg-white/10 duration-200 hover:text-gray-200 w-full"
          >
            <FontAwesomeIcon className="text-lg pl-1.5 pr-3" icon={faShuffle} />
            <div className="text-sm justify-between flex flex-row w-full">
              <p>{t('dashboard:sidebar.generate-random-hex')}</p>
              <p>{t('dashboard:sidebar.digits')}</p>
            </div>
          </div>
          <div className="flex flex-row absolute bottom-[0.4rem] right-[3.3rem] w-16 bg-bunker-800 border border-chicago-700 rounded-md text-bunker-200 ">
            <div
              onKeyDown={() => null}
              role="button"
              tabIndex={0}
              className="m-0.5 px-1 cursor-pointer rounded-md hover:bg-chicago-700"
              onClick={() => {
                if (randomStringLength > 1) {
                  setRandomStringLength(randomStringLength - 1);
                }
              }}
            >
              -
            </div>
            <input
              onChange={(e) => setRandomStringLength(parseInt(e.target.value, 10))}
              value={randomStringLength}
              className="text-center z-20 peer text-sm bg-transparent w-full outline-none"
              spellCheck="false"
            />
            <div
              onKeyDown={() => null}
              role="button"
              tabIndex={0}
              className="m-0.5 px-1 pb-0.5 cursor-pointer rounded-md hover:bg-chicago-700"
              onClick={() => {
                if (randomStringLength < 32) {
                  setRandomStringLength(randomStringLength + 1);
                }
              }}
            >
              +
            </div>
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
};

export default GenerateSecretMenu;
