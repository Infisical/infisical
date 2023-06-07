import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { faBan,faCheck, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from '@app/components/basic/buttons/Button';
import InputField from '@app/components/basic/InputField';
import ListBox from '@app/components/basic/Listbox';
import ApiKeyTable from '@app/components/basic/table/ApiKeyTable';
import NavHeader from '@app/components/navigation/NavHeader';
import checkPassword from '@app/components/utilities/checks/checkPassword';
import changePassword from '@app/components/utilities/cryptography/changePassword';
import issueBackupKey from '@app/components/utilities/cryptography/issueBackupKey';
import {
  useGetCommonPasswords,
  useRevokeAllSessions} from '@app/hooks/api';
import { SecuritySection } from '@app/views/Settings/PersonalSettingsPage/SecuritySection/SecuritySection';

import AddApiKeyDialog from '../../../components/basic/dialog/AddApiKeyDialog';
import getAPIKeys from '../../api/apiKey/getAPIKeys';
import getUser from '../../api/user/getUser';

type Errors = {
  length?: string,
  upperCase?: string,
  lowerCase?: string,
  number?: string,
  specialChar?: string,
  repeatedChar?: string,
};

export default function PersonalSettings() {
  const { data: commonPasswords } = useGetCommonPasswords();
  const [personalEmail, setPersonalEmail] = useState('');
  const [personalName, setPersonalName] = useState('');
  const [currentPasswordError, setCurrentPasswordError] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [backupKeyIssued, setBackupKeyIssued] = useState(false);
  const [backupKeyError, setBackupKeyError] = useState(false);
  const [isAddApiKeyDialogOpen, setIsAddApiKeyDialogOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  
  const revokeAllSessions = useRevokeAllSessions();

  const { t, i18n } = useTranslation();
  const router = useRouter();
  const lang = router.locale ?? 'en';

  const setLanguage = async (to: string) => {
    router.push(router.asPath, router.asPath, { locale: to });
    localStorage.setItem('lang', to);
    i18n.changeLanguage(to);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const user = await getUser();
        setApiKeys(await getAPIKeys());
        setPersonalEmail(user.email);
        setPersonalName(`${user.firstName} ${user.lastName}`);
      } catch (err) {
        console.error(err);
      }
    };

    load();
  }, []);

  const closeAddApiKeyModal = () => {
    setIsAddApiKeyDialogOpen(false);
  };

  return (
    <div className="flex max-h-screen flex-col justify-between bg-bunker-800 text-white">
      <Head>
        <title>{t('common.head-title', { title: t('settings.personal.title') })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <AddApiKeyDialog
        isOpen={isAddApiKeyDialogOpen}
        closeModal={closeAddApiKeyModal}
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
      />
      <div className="flex flex-row">
        <div className="max-h-screen w-full pb-2">
          <NavHeader pageName={t('settings.personal.title')} isProjectRelated={false} />
          <div className="ml-6 mt-8 mb-6 flex max-w-5xl flex-row items-center justify-between text-xl">
            <div className="flex flex-col items-start justify-start text-3xl">
              <p className="mr-4 font-semibold text-gray-200">{t('settings.personal.title')}</p>
              <p className="mr-4 text-base font-normal text-gray-400">
                {t('settings.personal.description')}
              </p>
            </div>
          </div>
          <div className="ml-6 mr-6 flex max-w-5xl flex-col text-mineshaft-50">
            <div className="mb-6 mt-4 flex w-full flex-col items-start rounded-md bg-white/5 px-6 pt-6 pb-6">
              <p className="self-start text-xl font-semibold">
                {t('settings.personal.change-language')}
              </p>
              <div className="w-ful mt-4 max-h-28">
                <ListBox
                  isSelected={lang}
                  onChange={setLanguage}
                  data={['en', 'ko', 'fr', 'es']}
                  text={`${t('common.language')}: `}
                />
              </div>
            </div>
            <SecuritySection />
            <div className="mt-2 mb-8 flex w-full flex-col items-start rounded-md bg-white/5 px-6 pt-4">
              <div className="flex w-full flex-row justify-between">
                <div className="flex w-full flex-col">
                  <p className="mb-3 text-xl font-semibold">
                    {t('settings.personal.api-keys.title')}
                  </p>
                  <p className="text-sm text-gray-400">
                    {t('settings.personal.api-keys.description')}
                  </p>
                </div>
                <div className="mt-2 w-40">
                  <Button
                    text={String(t('settings.personal.api-keys.add-new'))}
                    onButtonPressed={() => {
                      setIsAddApiKeyDialogOpen(true);
                    }}
                    color="mineshaft"
                    icon={faPlus}
                    size="md"
                  />
                </div>
              </div>
              <ApiKeyTable data={apiKeys} setApiKeys={setApiKeys as any} />
            </div>

            <div className="mb-6 flex w-full flex-col items-start rounded-md bg-white/5 px-6 pt-5 pb-6">
              <div className="flex w-full max-w-5xl flex-row items-center justify-between">
                <div className="flex w-full max-w-3xl flex-col justify-between">
                  <p className="mb-3 min-w-max text-xl font-semibold">
                    {t('section.password.change')}
                  </p>
                </div>
              </div>
              <div className="w-full max-w-xl">
                <InputField
                  label={t('section.password.current') as string}
                  onChangeHandler={(password) => {
                    setCurrentPassword(password);
                  }}
                  type="password"
                  value={currentPassword}
                  isRequired
                  error={currentPasswordError}
                  errorText={t('section.password.current-wrong') as string}
                  autoComplete="current-password"
                  id="current-password"
                />
                <div className="py-2" />
                <InputField
                  label={t('section.password.new') as string}
                  onChangeHandler={(password) => {
                    setNewPassword(password);
                    checkPassword({
                      password,
                      commonPasswords,
                      setErrors
                    });
                  }}
                  type="password"
                  value={newPassword}
                  isRequired
                  error={Object.keys(errors).length > 0}
                  autoComplete="new-password"
                  id="new-password"
                />
              </div>
              {Object.keys(errors).length > 0 && (
                <div className="mt-4 flex w-full flex-col items-start rounded-md bg-white/5 px-2 py-2">
                  <div className="mb-2 text-sm text-gray-400">{t('section.password.validate-base')}</div> 
                  {Object.keys(errors).map((key) => {
                    if (errors[key as keyof Errors]) {
                      return (
                        <div className="ml-1 flex flex-row items-top justify-start" key={key}>
                          <div>
                            <FontAwesomeIcon 
                              icon={faXmark} 
                              className="text-md text-red ml-0.5 mr-2.5"
                            />
                          </div>
                          <p className="text-gray-400 text-sm">
                            {errors[key as keyof Errors]} 
                          </p>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              )}
              <div className="mt-3 flex w-52 flex-row items-center pr-3">
                <Button
                  text={t('section.password.change') as string}
                  onButtonPressed={() => {
                    const errorCheck = checkPassword({
                      password: newPassword,
                      commonPasswords,
                      setErrors
                    });
                    if (!errorCheck) {
                      changePassword(
                        personalEmail,
                        currentPassword,
                        newPassword,
                        setCurrentPasswordError,
                        setPasswordChanged,
                        setCurrentPassword,
                        setNewPassword
                      );
                    }
                  }}
                  color="mineshaft"
                  size="md"
                  textDisabled={t('section.password.change') as string}
                />
                <FontAwesomeIcon
                  icon={faCheck}
                  className={`ml-4 text-3xl text-primary ${
                    passwordChanged ? 'opacity-100' : 'opacity-0'
                  } duration-300`}
                />
              </div>
            </div>
            <div className="mb-6 mt-2 flex w-full flex-col items-start rounded-md bg-white/5 px-6 pb-6 pt-2">
              <div className="my-4 flex w-full flex-row justify-between">
                <p className="text-xl font-semibold w-full">
                  Sessions
                </p>
                <div className="w-40">
                  <Button
                    text="Revoke all"
                    onButtonPressed={async () => {
                      await revokeAllSessions.mutateAsync();
                      router.push('/login');
                    }}
                    color="mineshaft"
                    icon={faBan}
                    size="md"
                    />
                </div>
              </div>
              <p className="mb-5 text-sm text-mineshaft-300">
                Logging into Infisical via browser or CLI creates a session. Revoking all sessions logs your account out all active sessions across all browsers and CLIs.
              </p> 
            </div>

            <div className="mt-2 mb-6 flex w-full flex-col items-start rounded-md bg-white/5 px-6 pt-5 pb-6">
              <div className="flex w-full max-w-5xl flex-row items-center justify-between">
                <div className="flex w-full max-w-3xl flex-col justify-between">
                  <p className="mb-3 min-w-max text-xl font-semibold">
                    {t('settings.personal.emergency.name')}
                  </p>
                  <p className="min-w-max text-sm text-mineshaft-300">
                    {t('settings.personal.emergency.text1')}
                  </p>
                  <p className="mb-5 min-w-max text-sm text-mineshaft-300">
                    {t('settings.personal.emergency.text2')}
                  </p>
                </div>
              </div>
              <div className="mb-4 w-full max-w-xl">
                <InputField
                  label={t('section.password.current') as string}
                  onChangeHandler={setBackupPassword}
                  type="password"
                  value={backupPassword}
                  isRequired
                  error={backupKeyError}
                  errorText={t('section.password.current-wrong') as string}
                  autoComplete="current-password"
                  id="current-password"
                />
              </div>
              <div className="mt-3 flex w-60 flex-row items-center">
                <Button
                  text={t('settings.personal.emergency.download') as string}
                  onButtonPressed={() => {
                    issueBackupKey({
                      email: personalEmail,
                      password: backupPassword,
                      personalName,
                      setBackupKeyError,
                      setBackupKeyIssued
                    });
                  }}
                  color="mineshaft"
                  size="md"
                  active={backupPassword !== ''}
                  textDisabled={t('settings.personal.emergency.download') as string}
                />
                <FontAwesomeIcon
                  icon={faCheck}
                  className={`ml-4 text-3xl text-primary ${
                    backupKeyIssued ? 'opacity-100' : 'opacity-0'
                  } duration-300`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

PersonalSettings.requireAuth = true;
