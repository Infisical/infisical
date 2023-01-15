import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { faCheck, faPlus, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Button from "~/components/basic/buttons/Button";
import InputField from "~/components/basic/InputField";
import ListBox from "~/components/basic/Listbox";
import ApiKeyTable from "~/components/basic/table/ApiKeyTable";
import NavHeader from "~/components/navigation/NavHeader";
import changePassword from "~/components/utilities/cryptography/changePassword";
import issueBackupKey from "~/components/utilities/cryptography/issueBackupKey";
import passwordCheck from "~/utilities/checks/PasswordCheck";
import { getTranslatedServerSideProps } from "~/utilities/withTranslateProps";

import AddApiKeyDialog from "../../../components/basic/dialog/AddApiKeyDialog";
import getAPIKeys from "../../api/apiKey/getAPIKeys";
import getUser from "../../api/user/getUser";

export default function PersonalSettings() {
  const [personalEmail, setPersonalEmail] = useState('');
  const [personalName, setPersonalName] = useState('');
  const [passwordErrorLength, setPasswordErrorLength] = useState(false);
  const [passwordErrorNumber, setPasswordErrorNumber] = useState(false);
  const [passwordErrorLowerCase, setPasswordErrorLowerCase] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [backupKeyIssued, setBackupKeyIssued] = useState(false);
  const [backupKeyError, setBackupKeyError] = useState(false);
  const [isAddApiKeyDialogOpen, setIsAddApiKeyDialogOpen] = useState(false)
  const [apiKeys, setApiKeys] = useState<any[]>([]);

  const { t } = useTranslation();
  const router = useRouter();
  const lang = router.locale ?? 'en';

  const setLanguage = async (to: string) => {
    router.push(router.asPath, router.asPath, { locale: to });
    localStorage.setItem('lang', to);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const user = await getUser();
        setApiKeys(
          await getAPIKeys()
        );
        setPersonalEmail(user.email);
        setPersonalName(user.firstName + " " + user.lastName);
      } catch (err) {
        console.error(err);
      }
    }
    
    load();
  }, []);

  const closeAddApiKeyModal = () => {
    setIsAddApiKeyDialogOpen(false);
  };

  return (
    <div className='bg-bunker-800 max-h-screen flex flex-col justify-between text-white'>
      <Head>
        <title>
          {t('common:head-title', { title: t('settings-personal:title') })}
        </title>
        <link rel='icon' href='/infisical.ico' />
      </Head>
      <AddApiKeyDialog
        isOpen={isAddApiKeyDialogOpen}
        closeModal={closeAddApiKeyModal}
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
      />
      <div className="flex flex-row">
        <div className="w-full max-h-screen pb-2 overflow-y-auto">
          <NavHeader
            pageName={t('settings-personal:title')}
            isProjectRelated={false}
          />
          <div className='flex flex-row justify-between items-center ml-6 mt-8 mb-6 text-xl max-w-5xl'>
            <div className='flex flex-col justify-start items-start text-3xl'>
              <p className='font-semibold mr-4 text-gray-200'>
                {t('settings-personal:title')}
              </p>
              <p className='font-normal mr-4 text-gray-400 text-base'>
                {t('settings-personal:description')}
              </p>
            </div>
          </div>
          <div className="flex flex-col ml-6 text-mineshaft-50 mr-6 max-w-5xl">
            <div className="bg-white/5 rounded-md px-6 pt-6 pb-6 flex flex-col items-start w-full mb-6 mt-4">
              <p className="text-xl font-semibold self-start">
                {t("settings-personal:change-language")}
              </p>
              <div className='max-h-28 w-ful mt-4'>
                <ListBox
                  selected={lang}
                  onChange={setLanguage}
                  data={['en', 'ko', 'fr']}
                  text={`${t('common:language')}: `}
                />
              </div>
            </div>
            <div className="bg-white/5 rounded-md px-6 flex flex-col items-start w-full mt-2 mb-8 pt-2">
              <div className="flex flex-row justify-between w-full">
                <div className="flex flex-col w-full">
                  <p className="text-xl font-semibold mb-3">
                    {t("settings-personal:api-keys.title")}
                  </p>
                  <p className="text-sm text-gray-400">
                    {t("settings-personal:api-keys.description")}
                  </p>
                </div>
                <div className="w-48 mt-2">
                  <Button
                    text={String(t("settings-personal:api-keys.add-new"))}
                    onButtonPressed={() => {
                      setIsAddApiKeyDialogOpen(true);
                    }}
                    color="mineshaft"
                    icon={faPlus}
                    size="md"
                  />
                </div>
              </div>
              <ApiKeyTable
                data={apiKeys}
                setApiKeys={setApiKeys as any}
              />
            </div>

            <div className='bg-white/5 rounded-md px-6 pt-5 pb-6 flex flex-col items-start w-full mb-6'>
              <div className='flex flex-row max-w-5xl justify-between items-center w-full'>
                <div className='flex flex-col justify-between w-full max-w-3xl'>
                  <p className='text-xl font-semibold mb-3 min-w-max'>
                    {t('section-password:change')}
                  </p>
                </div>
              </div>
              <div className='max-w-xl w-full'>
                <InputField
                  label={t('section-password:current') as string}
                  onChangeHandler={(password) => {
                    setCurrentPassword(password);
                  }}
                  type='password'
                  value={currentPassword}
                  isRequired
                  error={currentPasswordError}
                  errorText={t('section-password:current-wrong') as string}
                  autoComplete='current-password'
                  id='current-password'
                />
                <div className='py-2'></div>
                <InputField
                  label={t('section-password:new') as string}
                  onChangeHandler={(password) => {
                    setNewPassword(password);
                    passwordCheck({
                      password,
                      setPasswordErrorLength,
                      setPasswordErrorNumber,
                      setPasswordErrorLowerCase,
                      errorCheck: false,
                    });
                  }}
                  type='password'
                  value={newPassword}
                  isRequired
                  error={
                    passwordErrorLength &&
                    passwordErrorLowerCase &&
                    passwordErrorNumber
                  }
                  autoComplete='new-password'
                  id='new-password'
                />
              </div>
              {passwordErrorLength ||
              passwordErrorLowerCase ||
              passwordErrorNumber ? (
                <div className='w-full mt-3 bg-white/5 px-2 flex flex-col items-start py-2 rounded-md max-w-xl mb-2'>
                  <div className={`text-gray-400 text-sm mb-1`}>
                    {t('section-password:validate-base')}
                  </div>
                  <div className='flex flex-row justify-start items-center ml-1'>
                    {passwordErrorLength ? (
                      <FontAwesomeIcon
                        icon={faX}
                        className='text-md text-red mr-2.5'
                      />
                    ) : (
                      <FontAwesomeIcon
                        icon={faCheck}
                        className='text-md text-primary mr-2'
                      />
                    )}
                    <div
                      className={`${
                        passwordErrorLength ? 'text-gray-400' : 'text-gray-600'
                      } text-sm`}
                    >
                      {t('section-password:validate-length')}
                    </div>
                  </div>
                  <div className='flex flex-row justify-start items-center ml-1'>
                    {passwordErrorLowerCase ? (
                      <FontAwesomeIcon
                        icon={faX}
                        className='text-md text-red mr-2.5'
                      />
                    ) : (
                      <FontAwesomeIcon
                        icon={faCheck}
                        className='text-md text-primary mr-2'
                      />
                    )}
                    <div
                      className={`${
                        passwordErrorLowerCase
                          ? 'text-gray-400'
                          : 'text-gray-600'
                      } text-sm`}
                    >
                      {t('section-password:validate-case')}
                    </div>
                  </div>
                  <div className='flex flex-row justify-start items-center ml-1'>
                    {passwordErrorNumber ? (
                      <FontAwesomeIcon
                        icon={faX}
                        className='text-md text-red mr-2.5'
                      />
                    ) : (
                      <FontAwesomeIcon
                        icon={faCheck}
                        className='text-md text-primary mr-2'
                      />
                    )}
                    <div
                      className={`${
                        passwordErrorNumber ? 'text-gray-400' : 'text-gray-600'
                      } text-sm`}
                    >
                      {t('section-password:validate-number')}
                    </div>
                  </div>
                </div>
              ) : (
                <div className='py-2'></div>
              )}
              <div className='flex flex-row items-center mt-3 w-52 pr-3'>
                <Button
                  text={t('section-password:change') as string}
                  onButtonPressed={() => {
                    if (
                      !passwordErrorLength &&
                      !passwordErrorLowerCase &&
                      !passwordErrorNumber
                    ) {
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
                  color='mineshaft'
                  size='md'
                  active={
                    newPassword != '' &&
                    currentPassword != '' &&
                    !(
                      passwordErrorLength ||
                      passwordErrorLowerCase ||
                      passwordErrorNumber
                    )
                  }
                  textDisabled={t('section-password:change') as string}
                />
                <FontAwesomeIcon
                  icon={faCheck}
                  className={`ml-4 text-primary text-3xl ${
                    passwordChanged ? 'opacity-100' : 'opacity-0'
                  } duration-300`}
                />
              </div>
            </div>

            <div className="bg-white/5 rounded-md px-6 pt-5 pb-6 mt-2 flex flex-col items-start flex flex-col items-start w-full mb-6">
              <div className="flex flex-row max-w-5xl justify-between items-center w-full">
                <div className="flex flex-col justify-between w-full max-w-3xl">
                  <p className="text-xl font-semibold mb-3 min-w-max">
                    {t("settings-personal:emergency.name")}
                  </p>
                  <p className='text-sm text-mineshaft-300 min-w-max'>
                    {t('settings-personal:emergency.text1')}
                  </p>
                  <p className='text-sm text-mineshaft-300 mb-5 min-w-max'>
                    {t('settings-personal:emergency.text2')}
                  </p>
                </div>
              </div>
              <div className='w-full max-w-xl mb-4'>
                <InputField
                  label={t('section-password:current') as string}
                  onChangeHandler={setBackupPassword}
                  type='password'
                  value={backupPassword}
                  isRequired
                  error={backupKeyError}
                  errorText={t('section-password:current-wrong') as string}
                  autoComplete='current-password'
                  id='current-password'
                />
              </div>
              <div className='flex flex-row items-center mt-3 w-60'>
                <Button
                  text={t('settings-personal:emergency.download') as string}
                  onButtonPressed={() => {
                    issueBackupKey({
                      email: personalEmail,
                      password: backupPassword,
                      personalName,
                      setBackupKeyError,
                      setBackupKeyIssued,
                    });
                  }}
                  color='mineshaft'
                  size='md'
                  active={backupPassword != ''}
                  textDisabled={
                    t('settings-personal:emergency.download') as string
                  }
                />
                <FontAwesomeIcon
                  icon={faCheck}
                  className={`ml-4 text-primary text-3xl ${
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

export const getServerSideProps = getTranslatedServerSideProps([
  "settings",
  "settings-personal",
  "section-password",
  "section-api-key"
]);
