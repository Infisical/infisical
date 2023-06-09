/* eslint-disable no-nested-ternary */
/* eslint-disable no-unexpected-multiline */
/* eslint-disable react-hooks/exhaustive-deps */
import crypto from 'crypto';

import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { faBookOpen, faMobile, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { yupResolver } from '@hookform/resolvers/yup';
import queryString from 'query-string';
import * as yup from 'yup';

import { useNotificationContext } from '@app/components/context/Notifications/NotificationProvider';
import onboardingCheck from '@app/components/utilities/checks/OnboardingCheck';
import { tempLocalStorage } from '@app/components/utilities/checks/tempLocalStorage';
import { encryptAssymmetric } from '@app/components/utilities/cryptography/crypto';
import {
  Button,
  Checkbox,
  FormControl,
  Input,
  Menu,
  MenuItem,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  UpgradePlanModal
} from '@app/components/v2';
import { useOrganization, useSubscription, useUser, useWorkspace } from '@app/context';
import { usePopUp } from '@app/hooks';
import { fetchOrgUsers, useAddUserToWs, useCreateWorkspace, useUploadWsKey } from '@app/hooks/api';
import getOrganizations from '@app/pages/api/organization/getOrgs';
import getOrganizationUserProjects from '@app/pages/api/organization/GetOrgUserProjects';

import { Navbar } from './components/NavBar';

interface LayoutProps {
  children: React.ReactNode;
}

const formSchema = yup.object({
  name: yup.string().required().label('Project Name').trim(),
  addMembers: yup.bool().required().label('Add Members')
});

type TAddProjectFormData = yup.InferType<typeof formSchema>;

export const AppLayout = ({ children }: LayoutProps) => {
  const router = useRouter();
  const { createNotification } = useNotificationContext();

  // eslint-disable-next-line prefer-const
  const { workspaces, currentWorkspace } = useWorkspace();
  const { currentOrg } = useOrganization();
  const { user } = useUser();
  const { subscription } = useSubscription();

  const host = window.location.origin;
  const isAddingProjectsAllowed = ((subscription?.workspacesUsed || 0) < (subscription?.workspaceLimit || 1)) || host !== 'https://app.infisical.com';

  const createWs = useCreateWorkspace();
  const uploadWsKey = useUploadWsKey();
  const addWsUser = useAddUserToWs();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    'addNewWs',
    'upgradePlan'
  ] as const);
  const {
    control,
    formState: { isSubmitting },
    reset,
    handleSubmit
  } = useForm<TAddProjectFormData>({
    resolver: yupResolver(formSchema)
  });

  const [workspaceMapping, setWorkspaceMapping] = useState<Map<string, string>[]>([]);
  const [workspaceSelected, setWorkspaceSelected] = useState('∞');
  const [totalOnboardingActionsDone, setTotalOnboardingActionsDone] = useState(0);

  const { t } = useTranslation();

  // TODO(akhilmhdh): This entire logic will be rechecked and will try to avoid
  // Placing the localstorage as much as possible
  // Wait till tony integrates the azure and its launched
  useEffect(() => {
    // Put a user in a workspace if they're not in one yet

    const putUserInWorkSpace = async () => {
      if (tempLocalStorage('orgData.id') === '') {
        const userOrgs = await getOrganizations();
        localStorage.setItem('orgData.id', userOrgs[0]?._id);
      }

      const orgUserProjects = await getOrganizationUserProjects({
        orgId: tempLocalStorage('orgData.id')
      });
      const userWorkspaces = orgUserProjects;
      if (
        (userWorkspaces?.length === 0 &&
          router.asPath !== '/noprojects' &&
          !router.asPath.includes('home') &&
          !router.asPath.includes('settings')) ||
        router.asPath === '/dashboard/undefined'
      ) {
        router.push('/noprojects');
      } else if (router.asPath !== '/noprojects') {
        // const pathSegments = router.asPath.split('/').filter(segment => segment.length > 0);

        // let intendedWorkspaceId;
        // if (pathSegments.length >= 2 && pathSegments[0] === 'dashboard') {
        //   intendedWorkspaceId = pathSegments[1];
        // } else if (pathSegments.length >= 3 && pathSegments[0] === 'settings') {
        //   intendedWorkspaceId = pathSegments[2];
        // } else {
        //   intendedWorkspaceId = router.asPath
        //     .split('/')
        //     [router.asPath.split('/').length - 1].split('?')[0];
        // }

        const pathSegments = router.asPath.split('/').filter((segment) => segment.length > 0);

        let intendedWorkspaceId;
        if (pathSegments.length >= 2 && pathSegments[0] === 'dashboard') {
          [, intendedWorkspaceId] = pathSegments;
        } else if (pathSegments.length >= 3 && pathSegments[0] === 'settings') {
          [, , intendedWorkspaceId] = pathSegments;
        } else {
          const lastPathSegments = router.asPath.split('/').pop();
          if (lastPathSegments !== undefined) {
            [intendedWorkspaceId] = lastPathSegments.split('?');
          }

          // const lastPathSegment = router.asPath.split('/').pop().split('?');
          // [intendedWorkspaceId] = lastPathSegment;
        }

        if (!intendedWorkspaceId) return;

        if (!['callback', 'create', 'authorize'].includes(intendedWorkspaceId)) {
          localStorage.setItem('projectData.id', intendedWorkspaceId);
        }

        // If a user is not a member of a workspace they are trying to access, just push them to one of theirs
        if (
          !['callback', 'create', 'authorize'].includes(intendedWorkspaceId) &&
          userWorkspaces[0]?._id !== undefined &&
          !userWorkspaces
            .map((workspace: { _id: string }) => workspace._id)
            .includes(intendedWorkspaceId)
        ) {
          const { env } = queryString.parse(router.asPath.split('?')[1]);
          if (!env) {
            router.push(`/dashboard/${userWorkspaces[0]._id}`);
          }
        } else {
          setWorkspaceMapping(
            Object.fromEntries(
              userWorkspaces.map((workspace: any) => [workspace.name, workspace._id])
            ) as any
          );
          setWorkspaceSelected(
            Object.fromEntries(
              userWorkspaces.map((workspace: any) => [workspace._id, workspace.name])
            )[router.asPath.split('/')[router.asPath.split('/').length - 1].split('?')[0]]
          );
        }
      }
    };
    putUserInWorkSpace();
    onboardingCheck({ setTotalOnboardingActionsDone });
  }, [router.query.id]);

  useEffect(() => {
    try {
      if (
        workspaceMapping[workspaceSelected as any] &&
        `${workspaceMapping[workspaceSelected as any]}` !==
          router.asPath.split('/')[router.asPath.split('/').length - 1].split('?')[0]
      ) {
        localStorage.setItem('projectData.id', `${workspaceMapping[workspaceSelected as any]}`);
        router.push(`/dashboard/${workspaceMapping[workspaceSelected as any]}`);
      }
    } catch (err) {
      console.log(err);
    }
  }, [workspaceSelected]);

  const onCreateProject = async ({ name, addMembers }: TAddProjectFormData) => {
    // type check
    if (!currentOrg?._id) return;
    try {
      const {
        data: {
          workspace: { _id: newWorkspaceId }
        }
      } = await createWs.mutateAsync({
        organizationId: currentOrg?._id,
        workspaceName: name
      });

      const randomBytes = crypto.randomBytes(16).toString('hex');
      const PRIVATE_KEY = String(localStorage.getItem('PRIVATE_KEY'));
      const { ciphertext, nonce } = encryptAssymmetric({
        plaintext: randomBytes,
        publicKey: user.publicKey,
        privateKey: PRIVATE_KEY
      });

      await uploadWsKey.mutateAsync({
        encryptedKey: ciphertext,
        nonce,
        userId: user?._id,
        workspaceId: newWorkspaceId
      });

      if (addMembers) {
        // not using hooks because need at this point only
        const orgUsers = await fetchOrgUsers(currentOrg._id);
        orgUsers.forEach(({ status, user: orgUser }) => {
          // skip if status of org user is not accepted
          // this orgUser is the person who created the ws
          if (status !== 'accepted' || user.email === orgUser.email) return;
          addWsUser.mutate({ email: orgUser.email, workspaceId: newWorkspaceId });
        });
      }
      createNotification({ text: 'Workspace created', type: 'success' });
      handlePopUpClose('addNewWs');
      router.push(`/dashboard/${newWorkspaceId}`);
    } catch (err) {
      console.error(err);
      createNotification({ text: 'Failed to create workspace', type: 'error' });
    }
  };

  return (
    <>
      <div className="dark hidden h-screen w-full flex-col overflow-x-hidden md:flex">
        <Navbar />
        <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
          <aside className="w-full border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60">
            <nav className="items-between flex h-full flex-col justify-between">
              <div>
                {currentWorkspace && router.asPath !== "/noprojects" ? (
                  <div className="mt-3 mb-4 w-full p-4">
                    <p className="ml-1.5 mb-1 text-xs font-semibold uppercase text-gray-400">
                      Project
                    </p>
                    <Select
                      defaultValue={currentWorkspace?._id}
                      value={currentWorkspace?._id}
                      className="w-full truncate bg-mineshaft-600 py-2.5 font-medium"
                      onValueChange={(value) => {
                        router.push(`/dashboard/${value}`);
                      }}
                      position="popper"
                      dropdownContainerClassName="text-bunker-200 bg-mineshaft-800 border border-mineshaft-600 z-50 max-h-96 border-gray-700"
                    >
                      <div className='h-full no-scrollbar no-scrollbar::-webkit-scrollbar'>
                        {workspaces
                        .filter((ws) => ws.organization === currentOrg?._id)
                        .map(({ _id, name }) => (
                          <SelectItem
                            key={`ws-layout-list-${_id}`}
                            value={_id}
                            className={`${currentWorkspace?._id === _id && 'bg-mineshaft-600'}`}
                          >
                            {name}
                          </SelectItem>
                        ))}
                      </div>
                      <hr className="mt-1 mb-1 h-px border-0 bg-gray-700" />
                      <div className="w-full">
                        <Button
                          className="w-full bg-mineshaft-700 py-2 text-bunker-200"
                          colorSchema="primary"
                          variant="outline_bg"
                          size="sm"
                          onClick={() => {
                            if (isAddingProjectsAllowed) {
                              handlePopUpOpen('addNewWs')
                            } else {
                              handlePopUpOpen('upgradePlan');
                            }
                          }}
                          leftIcon={<FontAwesomeIcon icon={faPlus} />}
                        >
                          Add Project
                        </Button>
                      </div>
                    </Select>
                  </div>
                ) : (
                  <div className="mt-3 mb-4 w-full p-4">
                    <Button
                      className="border-mineshaft-500"
                      colorSchema="primary"
                      variant="outline_bg"
                      size="sm"
                      isFullWidth
                      onClick={() => {
                        if (isAddingProjectsAllowed) {
                          handlePopUpOpen('addNewWs')
                        } else {
                          handlePopUpOpen('upgradePlan');
                        }
                      }}
                      leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    >
                      Add Project
                    </Button>
                  </div>
                )}
                <div className={`${currentWorkspace && router.asPath !== "/noprojects" ? 'block' : 'hidden'}`}>
                  <Menu>
                    <Link href={`/dashboard/${currentWorkspace?._id}`} passHref>
                      <a>
                        <MenuItem
                          isSelected={router.asPath.includes(`/dashboard/${currentWorkspace?._id}`)}
                          icon="system-outline-90-lock-closed"
                        >
                          {t('nav.menu.secrets')}
                        </MenuItem>
                      </a>
                    </Link>
                    <Link href={`/users/${currentWorkspace?._id}`} passHref>
                      <a>
                        <MenuItem
                          isSelected={router.asPath === `/users/${currentWorkspace?._id}`}
                          icon="system-outline-96-groups"
                        >
                          {t('nav.menu.members')}
                        </MenuItem>
                      </a>
                    </Link>
                    <Link href={`/integrations/${currentWorkspace?._id}`} passHref>
                      <a>
                        <MenuItem
                          isSelected={router.asPath === `/integrations/${currentWorkspace?._id}`}
                          icon="system-outline-82-extension"
                        >
                          {t('nav.menu.integrations')}
                        </MenuItem>
                      </a>
                    </Link>
                    <Link href={`/activity/${currentWorkspace?._id}`} passHref>
                      <MenuItem
                        isSelected={router.asPath === `/activity/${currentWorkspace?._id}`}
                        // icon={<FontAwesomeIcon icon={faFileLines} size="lg" />}
                        icon="system-outline-168-view-headline"
                      >
                        Audit Logs
                      </MenuItem>
                    </Link>
                    <Link href={`/settings/project/${currentWorkspace?._id}`} passHref>
                      <a>
                        <MenuItem
                          isSelected={
                            router.asPath === `/settings/project/${currentWorkspace?._id}`
                          }
                          icon="system-outline-109-slider-toggle-settings"
                        >
                          {t('nav.menu.project-settings')}
                        </MenuItem>
                      </a>
                    </Link>
                  </Menu>
                </div>
              </div>
              <div className="mt-40 mb-4 w-full px-2">
                {router.asPath.split('/')[1] === 'home' ? (
                  <div className="relative flex cursor-pointer rounded bg-primary-50/10 px-0.5 py-2.5 text-sm text-white">
                    <div className="absolute inset-0 top-0 my-1 ml-1 mr-1 w-1 rounded-xl bg-primary" />
                    <p className="ml-4 mr-2 flex w-6 items-center justify-center text-lg">
                      <FontAwesomeIcon icon={faBookOpen} />
                    </p>
                    Infisical Guide
                    <img
                      src={`/images/progress-${totalOnboardingActionsDone === 0 ? '0' : ''}${
                        totalOnboardingActionsDone === 1 ? '14' : ''
                      }${totalOnboardingActionsDone === 2 ? '28' : ''}${
                        totalOnboardingActionsDone === 3 ? '43' : ''
                      }${totalOnboardingActionsDone === 4 ? '57' : ''}${
                        totalOnboardingActionsDone === 5 ? '71' : ''
                      }.svg`}
                      height={58}
                      width={58}
                      alt="progress bar"
                      className="absolute right-2 -top-2"
                    />
                  </div>
                ) : (
                  <Link href={`/home/${currentWorkspace?._id}`}>
                    <div className="mt-max relative flex h-10 cursor-pointer overflow-visible rounded bg-white/10 p-2.5 text-sm text-white hover:bg-primary-50/[0.15]">
                      <p className="flex w-10 items-center justify-center text-lg">
                        <FontAwesomeIcon icon={faBookOpen} />
                      </p>
                      Infisical Guide
                      <img
                        src={`/images/progress-${totalOnboardingActionsDone === 0 ? '0' : ''}${
                          totalOnboardingActionsDone === 1 ? '14' : ''
                        }${totalOnboardingActionsDone === 2 ? '28' : ''}${
                          totalOnboardingActionsDone === 3 ? '43' : ''
                        }${totalOnboardingActionsDone === 4 ? '57' : ''}${
                          totalOnboardingActionsDone === 5 ? '71' : ''
                        }.svg`}
                        height={58}
                        width={58}
                        alt="progress bar"
                        className="absolute right-2 -top-2"
                      />
                    </div>
                  </Link>
                )}
              </div>
            </nav>
          </aside>
          <Modal
            isOpen={popUp.addNewWs.isOpen}
            onOpenChange={(isModalOpen) => {
              handlePopUpToggle('addNewWs', isModalOpen);
              reset();
            }}
          >
            <ModalContent
              title="Create a new project"
              subTitle="This project will contain your secrets and configurations."
            >
              <form onSubmit={handleSubmit(onCreateProject)}>
                <Controller
                  control={control}
                  name="name"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Project Name"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input {...field} placeholder="Type your project name" />
                    </FormControl>
                  )}
                />
                <div className="mt-4 pl-1">
                  <Controller
                    control={control}
                    name="addMembers"
                    defaultValue
                    render={({ field: { onBlur, value, onChange } }) => (
                      <Checkbox
                        id="add-project-layout"
                        isChecked={value}
                        onCheckedChange={onChange}
                        onBlur={onBlur}
                      >
                        Add all members of my organization to this project
                      </Checkbox>
                    )}
                  />
                </div>
                <div className="mt-7 flex items-center">
                  <Button
                    isDisabled={isSubmitting}
                    isLoading={isSubmitting}
                    key="layout-create-project-submit"
                    className="mr-4"
                    type="submit"
                  >
                    Create Project
                  </Button>
                  <Button
                    key="layout-cancel-create-project"
                    onClick={() => handlePopUpClose('addNewWs')}
                    variant="plain"
                    colorSchema="secondary"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </ModalContent>
          </Modal>
          <UpgradePlanModal
            isOpen={popUp.upgradePlan.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle('upgradePlan', isOpen)}
            text="You have exceeded the number of projects allowed on the free plan."
          />
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 dark:[color-scheme:dark]">
            {children}
          </main>
        </div>
      </div>
      <div className="z-[200] flex h-screen w-screen flex-col items-center justify-center bg-bunker-800 md:hidden">
        <FontAwesomeIcon icon={faMobile} className="mb-8 text-7xl text-gray-300" />
        <p className="max-w-sm px-6 text-center text-lg text-gray-200">
          {` ${t('common.no-mobile')} `}
        </p>
      </div>
    </>
  );
};
