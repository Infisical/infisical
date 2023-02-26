import { useTranslation } from 'next-i18next';
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
    <div className="bg-bunker flex flex-col items-center w-full max-w-xs md:max-w-lg h-7/12 py-8 px-4 md:px-6 mx-1 mb-36 md:mb-16 rounded-xl drop-shadow-xl">
      <p className="text-4xl text-center font-semibold flex justify-center text-primary">
        {t('signup:step4-message')}
      </p>
      <div className="flex flex-col items-center justify-center w-full mt-4 md:mt-8 max-w-md text-gray-400 text-md rounded-md px-2">
        <div>{t('signup:step4-description1')}</div>
        <div className="mt-3">{t('signup:step4-description2')}</div>
      </div>
      <div className="w-full p-2 flex flex-row items-center bg-white/10 text-gray-400 rounded-md max-w-xs md:max-w-md mx-auto mt-4">
        <FontAwesomeIcon icon={faWarning} className="ml-2 mr-4 text-4xl" />
        {t('signup:step4-description3')}
      </div>
      <div className="flex flex-col items-center justify-center md:px-4 md:py-5 mt-4 px-2 py-3 max-h-24 max-w-max mx-auto text-lg">
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
