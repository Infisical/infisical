/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/jsx-key */
import React, { Fragment, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { faGithub, faSlack } from '@fortawesome/free-brands-svg-icons';
import { faCircleQuestion } from '@fortawesome/free-regular-svg-icons';
import {
  faAngleDown,
  faBook,
  faCoins,
  faEnvelope,
  faGear,
  faPlus,
  faRightFromBracket
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Menu, Transition } from '@headlessui/react';

import logout from '~/pages/api/auth/Logout';
import getOrganization from '~/pages/api/organization/GetOrg';
import getOrganizations from '~/pages/api/organization/getOrgs';
import getUser from '~/pages/api/user/getUser';

import guidGenerator from '../utilities/randomId';

const supportOptions = [
  [
    <FontAwesomeIcon className="text-lg pl-1.5 pr-3" icon={faSlack} />,
    'Join Slack Forum',
    'https://join.slack.com/t/infisical-users/shared_invite/zt-1kdbk07ro-RtoyEt_9E~fyzGo_xQYP6g'
  ],
  [
    <FontAwesomeIcon className="text-lg pl-1.5 pr-3" icon={faBook} />,
    'Read Docs',
    'https://infisical.com/docs/getting-started/introduction'
  ],
  [
    <FontAwesomeIcon className="text-lg pl-1.5 pr-3" icon={faGithub} />,
    'Open a GitHub Issue',
    'https://github.com/Infisical/infisical-cli/issues'
  ],
  [
    <FontAwesomeIcon className="text-lg pl-1.5 pr-3" icon={faEnvelope} />,
    'Send us an Email',
    'mailto:support@infisical.com'
  ]
];

export interface ICurrentOrg {
  name: string;
}

export interface IUser {
  firstName: string;
  lastName: string;
  email: string;
}

/**
 * This is the navigation bar in the main app.
 * It has two main components: support options and user menu (inlcudes billing, logout, org/user settings)
 * @returns NavBar
 */
export default function Navbar() {
  const router = useRouter();
  const [user, setUser] = useState<IUser | undefined>();
  const [orgs, setOrgs] = useState([]);
  const [currentOrg, setCurrentOrg] = useState<ICurrentOrg | undefined>();

  useEffect(() => {
    (async () => {
      const userData = await getUser();
      setUser(userData);
      const orgsData = await getOrganizations();
      setOrgs(orgsData);
      const currentOrg = await getOrganization({
        orgId: String(localStorage.getItem('orgData.id'))
      });
      setCurrentOrg(currentOrg);
    })();
  }, []);

  const closeApp = async () => {
    console.log('Logging out...');
    await logout();
    router.push('/login');
  };

  return (
    <div className="absolute flex flex-row justify-between w-full bg-bunker text-white border-b border-mineshaft-500 z-50">
      <div className="m-auto flex justify-start items-center mx-4">
        <div className="flex flex-row items-center">
          <div className="flex justify-center py-4">
            <Image
              src="/images/logotransparent.png"
              height={23}
              width={57}
              alt="logo"
            />
          </div>
          <a className="text-2xl text-white font-semibold mx-2">Infisical</a>
        </div>
      </div>
      <div className="relative flex justify-start items-center mx-2 z-40">
        <Menu as="div" className="relative inline-block text-left">
          <div className="mr-4">
            <Menu.Button className="inline-flex w-full justify-center rounded-md px-2 py-2 text-sm font-medium text-gray-200 rounded-md hover:bg-white/10 duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75">
              <FontAwesomeIcon className="text-xl" icon={faCircleQuestion} />
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
            <Menu.Items className="absolute right-0 mt-0.5 w-64 origin-top-right rounded-md bg-bunker border border-mineshaft-700 shadow-lg ring-1 ring-black z-20 ring-opacity-5 focus:outline-none px-2 py-1.5">
              {supportOptions.map((option) => (
                // eslint-disable-next-line react/jsx-no-target-blank
                <a
                  key={guidGenerator()}
                  target="_blank"
                  rel="noopener"
                  href={String(option[2])}
                  className="font-normal text-gray-300 duration-200 rounded-md w-full flex items-center py-0.5"
                >
                  <div className="relative flex justify-start items-center cursor-pointer select-none py-2 px-2 rounded-md text-gray-400 hover:bg-white/10 duration-200 hover:text-gray-200 w-full">
                    {option[0]}
                    <div className="text-sm">{option[1]}</div>
                  </div>
                </a>
              ))}
            </Menu.Items>
          </Transition>
        </Menu>
        <Menu as="div" className="relative inline-block text-left mr-4">
          <div>
            <Menu.Button className="inline-flex w-full justify-center rounded-md pr-2 pl-2 py-2 text-sm font-medium text-gray-200 rounded-md hover:bg-white/10 duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75">
              {user?.firstName} {user?.lastName}
              <FontAwesomeIcon
                icon={faAngleDown}
                className="ml-2 mt-1 text-sm text-gray-300 hover:text-lime-100"
              />
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
            <Menu.Items className="absolute right-0 mt-0.5 w-64 origin-top-right divide-y divide-gray-700 rounded-md bg-bunker border border-mineshaft-700 shadow-lg ring-1 ring-black z-20 ring-opacity-5 focus:outline-none">
              <div className="px-1 py-1 ">
                <div className="text-gray-400 self-start ml-2 mt-2 text-xs font-semibold tracking-wide">
                  SIGNED IN AS
                </div>
                <div
                  onClick={() =>
                    router.push('/settings/personal/' + router.query.id)
                  }
                  className="flex flex-row items-center px-1 mx-1 my-1 hover:bg-white/5 cursor-pointer rounded-md"
                >
                  <div className="bg-white/10 h-8 w-9 rounded-full flex items-center justify-center text-gray-300">
                    {user?.firstName?.charAt(0)}
                  </div>
                  <div className="flex items-center justify-between w-full">
                    <div>
                      <p className="text-gray-300 px-2 pt-1 text-sm">
                        {' '}
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="text-gray-400 px-2 pb-1 text-xs">
                        {' '}
                        {user?.email}
                      </p>
                    </div>
                    <FontAwesomeIcon
                      icon={faGear}
                      className="text-lg text-gray-400 p-2 mr-1 rounded-md cursor-pointer hover:bg-white/10"
                    />
                  </div>
                </div>
              </div>
              <div className="px-2 pt-2">
                <div className="text-gray-400 self-start ml-2 mt-2 text-xs font-semibold tracking-wide">
                  CURRENT ORGANIZATION
                </div>
                <div
                  onClick={() =>
                    router.push('/settings/org/' + router.query.id)
                  }
                  className="flex flex-row items-center px-2 mt-2 py-1 hover:bg-white/5 cursor-pointer rounded-md"
                >
                  <div className="bg-white/10 h-7 w-8 rounded-md flex items-center justify-center text-gray-300">
                    {currentOrg?.name?.charAt(0)}
                  </div>
                  <div className="flex items-center justify-between w-full">
                    <p className="text-gray-300 px-2 text-sm">
                      {currentOrg?.name}
                    </p>
                    <FontAwesomeIcon
                      icon={faGear}
                      className="text-lg text-gray-400 p-2 rounded-md cursor-pointer hover:bg-white/10"
                    />
                  </div>
                </div>
                <button
                  // onClick={buttonAction}
                  className="cursor-pointer w-full"
                >
                  <div
                    onClick={() =>
                      router.push('/settings/billing/' + router.query.id)
                    }
                    className="mt-1 relative flex justify-start cursor-pointer select-none py-2 px-2 rounded-md text-gray-400 hover:bg-white/5 duration-200 hover:text-gray-200"
                  >
                    <FontAwesomeIcon
                      className="text-lg pl-1.5 pr-3"
                      icon={faCoins}
                    />
                    <div className="text-sm">Usage & Billing</div>
                  </div>
                </button>
                <button
                  // onClick={buttonAction}
                  className="cursor-pointer w-full mb-2"
                >
                  <div
                    onClick={() =>
                      router.push(
                        '/settings/org/' + router.query.id + '?invite'
                      )
                    }
                    className="relative flex justify-start cursor-pointer select-none py-2 pl-10 pr-4 rounded-md text-gray-400 hover:bg-primary/100 duration-200 hover:text-black hover:font-semibold mt-1"
                  >
                    <span className="rounded-lg absolute inset-y-0 left-0 flex items-center pl-3 pr-4">
                      <FontAwesomeIcon icon={faPlus} className="ml-1" />
                    </span>
                    <div className="text-sm ml-1">Invite Members</div>
                  </div>
                </button>
              </div>
              {orgs?.length > 1 && (
                <div className="px-1 pt-1">
                  <div className="text-gray-400 self-start ml-2 mt-2 text-xs font-semibold tracking-wide">
                    OTHER ORGANIZATIONS
                  </div>
                  <div className="flex flex-col items-start px-1 mt-3 mb-2">
                    {orgs
                      .filter(
                        (org: { _id: string }) =>
                          org._id != localStorage.getItem('orgData.id')
                      )
                      .map((org: { _id: string; name: string }) => (
                        <div
                          key={guidGenerator()}
                          onClick={() => {
                            localStorage.setItem('orgData.id', org._id);
                            router.reload();
                          }}
                          className="flex flex-row justify-start items-center hover:bg-white/5 w-full p-1.5 cursor-pointer rounded-md"
                        >
                          <div className="bg-white/10 h-7 w-8 rounded-md flex items-center justify-center text-gray-300">
                            {org.name.charAt(0)}
                          </div>
                          <div className="flex items-center justify-between w-full">
                            <p className="text-gray-300 px-2 text-sm">
                              {org.name}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              <div className="px-1 py-1">
                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={closeApp}
                      className={`${
                        active
                          ? 'bg-red font-semibold text-white'
                          : 'text-gray-400'
                      } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                    >
                      <div className="relative flex justify-start items-center cursor-pointer select-none">
                        <FontAwesomeIcon
                          className="text-lg ml-1.5 mr-3"
                          icon={faRightFromBracket}
                        />
                        Log Out
                      </div>
                    </button>
                  )}
                </Menu.Item>
              </div>
            </Menu.Items>
          </Transition>
        </Menu>
      </div>
    </div>
  );
}
