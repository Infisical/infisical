import { useTranslation } from "react-i18next";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useToggle } from "@app/hooks";
import { generateUserBackupKey } from "@app/lib/crypto";

import { useNotificationContext } from "../context/Notifications/NotificationProvider";
import { generateBackupPDFAsync } from "../utilities/generateBackupPDF";
import { Button } from "../v2";

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
  const { createNotification } = useNotificationContext();
  const [isLoading, setIsLoading] = useToggle();

  const handleBackupKeyGenerate = async () => {
    try {
      setIsLoading.on();
      const generatedKey = await generateUserBackupKey(email, password);
      await generateBackupPDFAsync({
        generatedKey,
        personalEmail: email,
        personalName: name
      });
      incrementStep();
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to generate backup key"
      });
    } finally {
      setIsLoading.off();
    }
  };

  return (
    <div className="flex flex-col items-center w-full h-full md:px-6 mx-auto mb-36 md:mb-16">
      <p className="text-xl text-center font-medium flex flex-col justify-center items-center text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200">
        <FontAwesomeIcon icon={faWarning} className="ml-2 mr-3 pt-1 mb-6 text-6xl text-bunker-200" />
        {t("signup.step4-message")}
      </p>
      <div className="flex flex-col pb-2 bg-mineshaft-800 border border-mineshaft-600 items-center justify-center text-center lg:w-1/6 w-full md:min-w-[24rem] mt-8 max-w-md text-bunker-300 text-md rounded-md">
        <div className="w-full mt-4 md:mt-8 flex flex-row text-center items-center m-2 text-bunker-300 rounded-md lg:w-1/6 lg:w-1/6 w-full md:min-w-[23rem] px-3 mx-auto">
          <span className="mb-2">
            {t("signup.step4-description1")} {t("signup.step4-description3")}
          </span>
        </div>
        <div className="flex flex-col items-center px-3 justify-center mt-0 md:mt-4 mb-2 md:mb-4 lg:w-1/6 w-full md:min-w-[20rem] mt-2 md:max-w-md mx-auto text-sm text-center md:text-left">
          <div className="text-l py-1 text-lg w-full">
            <Button
              onClick={handleBackupKeyGenerate}
              size="sm"
              isFullWidth
              isLoading={isLoading}
              isDisabled={isLoading}
              className="h-12"
              colorSchema="primary"
              variant="outline_bg"
            >
              Download PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
