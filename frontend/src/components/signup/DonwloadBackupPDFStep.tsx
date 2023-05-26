import { useTranslation } from 'react-i18next';
import { faWarning } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from '../basic/buttons/Button';
import issueBackupKey from '../utilities/cryptography/issueBackupKey';

interface DownloadBackupPDFStepProps {
  incrementStep: () => void;
  email: string;
  password: string;
  name: string;
}

/**
 * This is the step of the signup flow where the user downloads the backup pdf
 * @param {object} obj
 * @param {function} obj.incrementStep - function that moves the user on to the next stage of signup
 * @param {string} obj.email - user's email
 * @param {string} obj.password - user's password
 * @param {string} obj.name - user's name
 * @returns
 */
export default function DonwloadBackupPDFStep({
  incrementStep,
  email,
  password,
  name
}: DownloadBackupPDFStepProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="h-7/12 mx-1 mb-36 flex w-full max-w-xs flex-col items-center rounded-xl bg-bunker py-8 px-4 drop-shadow-xl md:mb-16 md:max-w-lg md:px-6">
      <p className="flex justify-center text-center text-4xl font-semibold text-primary">
        {t('signup.step4-message')}
      </p>
      <div className="text-md mt-4 flex w-full max-w-md flex-col items-center justify-center rounded-md px-2 text-gray-400 md:mt-8">
        <div>{t('signup.step4-description1')}</div>
        <div className="mt-3">{t('signup.step4-description2')}</div>
      </div>
      <div className="mx-auto mt-4 flex w-full max-w-xs flex-row items-center rounded-md bg-white/10 p-2 text-gray-400 md:max-w-md">
        <FontAwesomeIcon icon={faWarning} className="ml-2 mr-4 text-4xl" />
        {t('signup.step4-description3')}
      </div>
      <div className="mx-auto mt-4 flex max-h-24 max-w-max flex-col items-center justify-center px-2 py-3 text-lg md:px-4 md:py-5">
        <Button
          text="Download PDF"
          onButtonPressed={async () => {
            await issueBackupKey({
              email,
              password,
              personalName: name,
              setBackupKeyError: () => {},
              setBackupKeyIssued: () => {}
            });
            incrementStep();
          }}
          size="lg"
        />
      </div>
    </div>
  );
}
