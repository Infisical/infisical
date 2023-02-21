/* eslint-disable no-nested-ternary */
/* eslint-disable no-unexpected-multiline */
/* eslint-disable react-hooks/exhaustive-deps */
import crypto from 'crypto';

import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import {
  faBookOpen,
  faFileLines,
  faGear,
  faKey,
  faMobile,
  faPlug,
  faPlus,
  faUser
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { yupResolver } from '@hookform/resolvers/yup';
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
  SelectItem
} from '@app/components/v2';
import { useOrganization, useUser, useWorkspace } from '@app/context';
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
  let { workspaces, currentWorkspace } = useWorkspace();
  const { currentOrg } = useOrganization();
  workspaces = workspaces.filter((ws) => ws.organization === currentOrg?._id);
  const { user } = useUser();

  const createWs = useCreateWorkspace();
  const uploadWsKey = useUploadWsKey();
  const addWsUser = useAddUserToWs();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    'addNewWs'
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
        (userWorkspaces.length === 0 &&
          router.asPath !== '/noprojects' &&
          !router.asPath.includes('home') &&
          !router.asPath.includes('settings')) ||
        router.asPath === '/dashboard/undefined'
      ) {
        router.push('/noprojects');
      } else if (router.asPath !== '/noprojects') {
        const intendedWorkspaceId = router.asPath
          .split('/')
          [router.asPath.split('/').length - 1].split('?')[0];

        if (!['callback', 'create', 'authorize'].includes(intendedWorkspaceId)) {
          localStorage.setItem('projectData.id', intendedWorkspaceId);
        }

        // If a user is not a member of a workspace they are trying to access, just push them to one of theirs
        if (
          !['callback', 'create', 'authorize'].includes(intendedWorkspaceId) && userWorkspaces[0]?._id !== undefined &&
          !userWorkspaces
            .map((workspace: { _id: string }) => workspace._id)
            .includes(intendedWorkspaceId)
        ) {
          router.push(`/dashboard/${userWorkspaces[0]._id}`);
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
        console.log('adding other users');
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
      <div className="hidden h-screen w-full flex-col overflow-x-hidden md:flex dark">
        <Navbar />
        <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
          <aside className="w-full border-r border-mineshaft-500 bg-mineshaft-900 md:w-60">
            <nav className="items-between flex h-full flex-col justify-between">
              <div>
                {currentWorkspace ? (
                  <div className="w-full p-4 mt-3 mb-4">
                    <p className="text-xs font-semibold ml-1.5 mb-1 uppercase text-gray-400">
                      Project
                    </p>
                    <Select
                      defaultValue={currentWorkspace?._id}
                      value={currentWorkspace?._id}
                      className="w-full py-2.5 bg-mineshaft-600 font-medium truncate"
                      onValueChange={(value) => {
                        router.push(`/dashboard/${value}`);
                      }}
                      position="popper"
                      dropdownContainerClassName="text-bunker-200 bg-mineshaft-800 border border-mineshaft-600 z-50"
                    >
                      {workspaces.map(({ _id, name }) => (
                        <SelectItem
                          key={`ws-layout-list-${_id}`}
                          value={_id}
                          className={`${currentWorkspace?._id === _id && 'bg-mineshaft-600'}`}
                        >
                          {name}
                        </SelectItem>
                      ))}
                      <hr className="mt-1 mb-1 h-px border-0 bg-gray-700" />
                      <div className="w-full">
                        <Button
                          className="w-full py-2 text-bunker-200 bg-mineshaft-500 hover:bg-primary/90 hover:text-black"
                          color="mineshaft"
                          size="sm"
                          onClick={() => handlePopUpOpen('addNewWs')}
                          leftIcon={<FontAwesomeIcon icon={faPlus} />}
                        >
                          Add Project
                        </Button>
                      </div>
                    </Select>
                  </div>
                ) : (
                  <div className="w-full p-4 mt-3 mb-4">
                    <Button
                      className="w-full py-2 text-bunker-200 bg-mineshaft-500 hover:bg-primary/90 hover:text-black"
                      color="mineshaft"
                      size="sm"
                      onClick={() => handlePopUpOpen('addNewWs')}
                      leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    >
                      Add Project
                    </Button>
                  </div>
                )}
                <div className={`${currentWorkspace ? 'block' : 'hidden'}`}>
                  <Menu>
                    <Link href={`/dashboard/${currentWorkspace?._id}`} passHref>
                      <a>
                        <MenuItem
                          isSelected={router.asPath === `/dashboard/${currentWorkspace?._id}`}
                          icon={<FontAwesomeIcon icon={faKey} size="lg" />}
                        >
                          {t('nav:menu.secrets')}
                        </MenuItem>
                      </a>
                    </Link>
                    <Link href={`/users/${currentWorkspace?._id}`} passHref>
                      <a>
                        <MenuItem
                          isSelected={router.asPath === `/users/${currentWorkspace?._id}`}
                          icon={<FontAwesomeIcon icon={faUser} size="lg" />}
                        >
                          {t('nav:menu.members')}
                        </MenuItem>
                      </a>
                    </Link>
                    <Link href={`/integrations/${currentWorkspace?._id}`} passHref>
                      <a>
                        <MenuItem
                          isSelected={router.asPath === `/integrations/${currentWorkspace?._id}`}
                          icon={<FontAwesomeIcon icon={faPlug} size="lg" />}
                        >
                          {t('nav:menu.integrations')}
                        </MenuItem>
                      </a>
                    </Link>
                    <Link href={`/activity/${currentWorkspace?._id}`} passHref>
                      <a>
                        <MenuItem
                          isSelected={router.asPath === `/activity/${currentWorkspace?._id}`}
                          icon={<FontAwesomeIcon icon={faFileLines} size="lg" />}
                        >
                          Activity Logs
                        </MenuItem>
                      </a>
                    </Link>
                    <Link href={`/settings/project/${currentWorkspace?._id}`} passHref>
                      <a>
                        <MenuItem
                          isSelected={
                            router.asPath === `/settings/project/${currentWorkspace?._id}`
                          }
                          icon={<FontAwesomeIcon icon={faGear} size="lg" />}
                        >
                          {t('nav:menu.project-settings')}
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
                <div className="pl-1 mt-4">
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
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 dark:[color-scheme:dark]">
            {children}
          </main>
        </div>
      </div>
      <div className="z-[200] flex h-screen w-screen flex-col items-center justify-center bg-bunker-800 md:hidden">
        <FontAwesomeIcon icon={faMobile} className="mb-8 text-7xl text-gray-300" />
        <p className="max-w-sm px-6 text-center text-lg text-gray-200">
          {` ${t('common:no-mobile')} `}
        </p>
      </div>
    </>
  );
};
