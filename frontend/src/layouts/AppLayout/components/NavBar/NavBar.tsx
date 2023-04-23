/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable react/jsx-key */
import { Fragment, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { TFunction, useTranslation } from 'next-i18next';
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
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

import { useNotificationContext } from '@app/components/context/Notifications/NotificationProvider';
import guidGenerator from '@app/components/utilities/randomId';
import { Button, FormControl, Input, Modal, ModalContent } from '@app/components/v2';
import { useOrganization, useUser } from '@app/context';
import { useLogoutUser } from '@app/hooks/api';
import { useCreateOrganization } from '@app/hooks/api/organization/queries';

const supportOptions = (t: TFunction) => [
  [
    <FontAwesomeIcon className="pl-1.5 pr-3 text-lg" icon={faSlack} />,
    t('nav:support.slack'),
    'https://infisical.com/slack'
  ],
  [
    <FontAwesomeIcon className="pl-1.5 pr-3 text-lg" icon={faBook} />,
    t('nav:support.docs'),
    'https://infisical.com/docs/getting-started/introduction'
  ],
  [
    <FontAwesomeIcon className="pl-1.5 pr-3 text-lg" icon={faGithub} />,
    t('nav:support.issue'),
    'https://github.com/Infisical/infisical-cli/issues'
  ],
  [
    <FontAwesomeIcon className="pl-1.5 pr-3 text-lg" icon={faEnvelope} />,
    t('nav:support.email'),
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

const formSchema = yup.object({
  orgName: yup.string().required().label('Organization Name').trim(),
  // defaultProject: yup.string().required().label("Project Name").trim()
})

type TAddOrganizationFormData = yup.InferType<typeof formSchema>;

/**
 * This is the navigation bar in the main app.
 * It has two main components: support options and user menu (inlcudes billing, logout, org/user settings)
 * @returns NavBar
 */
export const Navbar = () => {
  const [isNewOrgModalOpen, setIsNewOrgModalOpen] = useState(false);
  const { createNotification } = useNotificationContext();

  const createOrg = useCreateOrganization();

  const {
    control, 
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TAddOrganizationFormData>({
    resolver: yupResolver(formSchema)
  });

  const router = useRouter();

  const { currentOrg, orgs } = useOrganization();
  const { user } = useUser();

  const logout = useLogoutUser();

  const { t } = useTranslation();

  // remove this memo
  const supportOptionsList = useMemo(() => supportOptions(t), [t]);

  const closeApp = async () => {
    try {
      console.log('Logging out...')
      await logout.mutateAsync();
      localStorage.removeItem('protectedKey');
      localStorage.removeItem('protectedKeyIV');
      localStorage.removeItem('protectedKeyTag');
      localStorage.removeItem('publicKey');
      localStorage.removeItem('encryptedPrivateKey');
      localStorage.removeItem('iv');
      localStorage.removeItem('tag');
      localStorage.removeItem('PRIVATE_KEY');
      localStorage.removeItem('orgData.id');
      localStorage.removeItem('projectData.id');
      router.push('/login');
    } catch (error) {
      console.error(error);
    }
  };

  const onCreateNewOrganization = async ({ orgName }: TAddOrganizationFormData) => {
    console.log("create organization form submitted!");
    
    try{
      const { data: {organization} } = await createOrg.mutateAsync({
        newOrgName: orgName
      })
      localStorage.setItem('orgData.id', organization?._id);
      setIsNewOrgModalOpen(false);
      // router.reload();
      router.push('/dashboard');
      createNotification({ text: 'Organization created', type: 'success' });
    }catch(err){
      console.error(err);
      createNotification({ text: 'Failed to create organization', type: 'error' });
    }
  };

  return (
    <div className="z-[70] flex w-full flex-row justify-between border-b border-mineshaft-500 bg-mineshaft-900 text-white">
      <div className="m-auto mx-4 flex items-center justify-start">
        <div className="flex flex-row items-center">
          <div className="flex justify-center py-4">
            <Image src="/images/logotransparent.png" height={23} width={57} alt="logo" />
          </div>
          <a href="#" className="mx-2 text-2xl font-semibold text-white">
            Infisical
          </a>
        </div>
      </div>
      <div className="relative z-40 mx-2 flex items-center justify-start">
        <a
          href="https://infisical.com/docs/getting-started/introduction"
          target="_blank"
          rel="noopener noreferrer"
          className="mr-4 flex items-center rounded-md px-3 py-2 text-sm text-gray-200 duration-200 hover:bg-white/10"
        >
          <FontAwesomeIcon icon={faBook} className="mr-2 text-xl" />
          Docs
        </a>
        <Menu as="div" className="relative inline-block text-left">
          <div className="mr-4">
            <Menu.Button className="inline-flex w-full justify-center rounded-md px-2 py-2 text-sm font-medium text-gray-200 duration-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75">
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
            <Menu.Items className="absolute right-0 z-20 mt-0.5 w-64 origin-top-right rounded-md border border-mineshaft-700 bg-bunker px-2 py-1.5 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
              {supportOptionsList.map(([icon, text, url]) => (
                <a
                  key={guidGenerator()}
                  target="_blank"
                  rel="noopener noreferrer"
                  href={String(url)}
                  className="flex w-full items-center rounded-md py-0.5 font-normal text-gray-300 duration-200"
                >
                  <div className="relative flex w-full cursor-pointer select-none items-center justify-start rounded-md py-2 px-2 text-gray-400 duration-200 hover:bg-white/10 hover:text-gray-200">
                    {icon}
                    <div className="text-sm">{text}</div>
                  </div>
                </a>
              ))}
            </Menu.Items>
          </Transition>
        </Menu>
        <Menu as="div" className="relative mr-4 inline-block text-left">
          <div>
            <Menu.Button className="inline-flex w-full justify-center rounded-md py-2 pr-2 pl-2 text-sm font-medium text-gray-200 duration-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75">
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
            <Menu.Items className="absolute right-0 z-[125] mt-0.5 w-68 origin-top-right divide-y divide-mineshaft-700 drop-shadow-2xl rounded-md border border-mineshaft-700 bg-mineshaft-900 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
              <div className="px-1 py-1">
                <div className="ml-2 mt-2 self-start text-xs font-semibold tracking-wide text-gray-400">
                  {t('nav:user.signed-in-as')}
                </div>
                <div
                  onKeyDown={() => null}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/settings/personal/${router.query.id}`)}
                  className="mx-1 my-1 flex cursor-pointer flex-row items-center rounded-md px-1 hover:bg-white/5"
                >
                  <div className="flex h-8 w-9 items-center justify-center rounded-full bg-white/10 text-gray-300">
                    {user?.firstName?.charAt(0)}
                  </div>
                  <div className="flex w-full items-center justify-between">
                    <div>
                      <p className="px-2 pt-1 text-sm text-gray-300">
                        {' '}
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="px-2 pb-1 text-xs text-gray-400"> {user?.email}</p>
                    </div>
                    <FontAwesomeIcon
                      icon={faGear}
                      className="mr-1 cursor-pointer rounded-md p-2 text-lg text-gray-400 hover:bg-white/10"
                    />
                  </div>
                </div>
              </div>
              <div className="px-2 pt-2">
                <div className="ml-2 mt-2 self-start text-xs font-semibold tracking-wide text-gray-400">
                  {t('nav:user.current-organization')}
                </div>
                <div
                  onKeyDown={() => null}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/settings/org/${router.query.id}`)}
                  className="mt-2 flex cursor-pointer flex-row items-center rounded-md px-2 py-1 hover:bg-white/5"
                >
                  <div className="flex h-7 w-8 items-center justify-center rounded-md bg-white/10 text-gray-300">
                    {currentOrg?.name?.charAt(0)}
                  </div>
                  <div className="flex w-full items-center justify-between">
                    <p className="px-2 text-sm text-gray-300">{currentOrg?.name}</p>
                    <FontAwesomeIcon
                      icon={faGear}
                      className="cursor-pointer rounded-md p-2 text-lg text-gray-400 hover:bg-white/10"
                    />
                  </div>
                </div>
                <button
                  // onClick={buttonAction}
                  type="button"
                  className="w-full cursor-pointer"
                >
                  <div
                    onKeyDown={() => null}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/settings/billing/${router.query.id}`)}
                    className="relative mt-1 flex cursor-pointer select-none justify-start rounded-md py-2 px-2 text-gray-400 duration-200 hover:bg-white/5 hover:text-gray-200"
                  >
                    <FontAwesomeIcon className="pl-1.5 pr-3 text-lg" icon={faCoins} />
                    <div className="text-sm">{t('nav:user.usage-billing')}</div>
                  </div>
                </button>
                <button
                  type="button"
                  // onClick={buttonAction}
                  className="mb-2 w-full cursor-pointer"
                >
                  <div
                    onKeyDown={() => null}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/settings/org/${router.query.id}?invite`)}
                    className="relative mt-1 flex cursor-pointer select-none justify-start rounded-md py-2 pl-10 pr-4 text-gray-400 duration-200 hover:bg-primary/100 hover:font-semibold hover:text-black"
                  >
                    <span className="absolute inset-y-0 left-0 flex items-center rounded-lg pl-3 pr-4">
                      <FontAwesomeIcon icon={faPlus} className="ml-1" />
                    </span>
                    <div className="ml-1 text-sm">{t('nav:user.invite')}</div>
                  </div>
                </button>
              </div>
              {orgs && orgs?.length > 0 && (
                <div className="px-1 py-1">
                  <div className="ml-2 mt-2 self-start text-xs font-semibold tracking-wide text-gray-400">
                    {t('nav:user.other-organizations')}
                  </div>
                  <div className="flex flex-col items-start px-1">
                    {orgs
                      ?.filter((org: { _id: string }) => org._id !== currentOrg?._id)
                      .map((org: { _id: string; name: string }) => (
                        <div
                          onKeyDown={() => null}
                          role="button"
                          tabIndex={0}
                          key={guidGenerator()}
                          onClick={() => {
                            localStorage.setItem('orgData.id', org._id);
                            router.reload();
                          }}
                          className="flex w-full cursor-pointer flex-row items-center justify-start rounded-md p-1.5 hover:bg-white/5"
                        >
                          <div className="flex h-7 w-8 items-center justify-center rounded-md bg-white/10 text-gray-300">
                            {org.name.charAt(0)}
                          </div>
                          <div className="flex w-full items-center justify-between">
                            <p className="px-2 text-sm text-gray-300">{org.name}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                    <div className='px-1 pt-1'>
                      <div
                        onKeyDown={() => null}
                        role="button"
                        tabIndex={0}
                        onClick={() => setIsNewOrgModalOpen(true)}
                        className="relative mt-1 flex cursor-pointer select-none justify-start rounded-md py-2 pl-10 pr-4 text-gray-400 duration-200 hover:bg-primary/100 hover:font-semibold hover:text-black"
                      >
                        <span className="absolute inset-y-0 left-0 flex items-center rounded-lg pl-3 pr-4">
                          <FontAwesomeIcon icon={faPlus} className="ml-1" />
                        </span>
                        <div className="ml-1 text-sm">{t('nav:user.new-organization')}</div>
                      </div>
                    </div>
                </div>
              )}
              <div className="px-1 py-1">
                <Menu.Item>
                  {({ active }) => (
                    <button
                      type="button"
                      onClick={closeApp}
                      className={`${
                        active ? 'bg-red font-semibold text-white' : 'text-gray-400'
                      } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                    >
                      <div className="relative flex cursor-pointer select-none items-center justify-start">
                        <FontAwesomeIcon
                          className="ml-1.5 mr-3 text-lg"
                          icon={faRightFromBracket}
                        />
                        {t('common:logout')}
                      </div>
                    </button>
                  )}
                </Menu.Item>
              </div>
            </Menu.Items>
          </Transition>
        </Menu>

        <Modal
          isOpen={isNewOrgModalOpen}
          onOpenChange={setIsNewOrgModalOpen}
        >
            <ModalContent
              title="Create a new Organization"
              subTitle="This Organization will contain your Workspaces, secrets and so on."
            >
              <form onSubmit={handleSubmit(onCreateNewOrganization)}>
                <Controller
                control={control}
                name="orgName"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                  label="Organization Name"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  >
                    <Input {...field} placeholder="Type your Organization name" />
                  </FormControl>
                )} />

                {/* <Controller
                  control={control}
                  name="defaultProject"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                    label="Project Name"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    >
                      <Input {...field} placeholder="Type your default project/workspace name" />
                    </FormControl>
                  )}
                /> */}

                <div className="mt-7 flex items-center">
                  <Button
                    isDisabled={isSubmitting}
                    isLoading={isSubmitting}
                    key="layout-create-project-submit"
                    className="mr-4"
                    type="submit"
                  >
                    Create Organization
                  </Button>
                  <Button
                    key="layout-cancel-create-project"
                    onClick={() => setIsNewOrgModalOpen(false)}
                    variant="plain"
                    colorSchema="secondary"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </ModalContent>
          </Modal>
      </div>
    </div>
  );
};
