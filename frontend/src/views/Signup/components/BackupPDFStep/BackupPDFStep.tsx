import { useTranslation } from "react-i18next";
import { useRouter } from "next/router"
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import issueBackupKey from "@app/components/utilities/cryptography/issueBackupKey";
import { Button } from "@app/components/v2";

interface DownloadBackupPDFStepProps {
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
export const BackupPDFStep = ({
    email,
    password,
    name
}: DownloadBackupPDFStepProps) => {
    const { t } = useTranslation();
    const router = useRouter();

  return (
    <div className="flex flex-col items-center w-full h-full md:px-6 mx-auto mb-36 md:mb-16">
      <p className="text-xl text-center font-medium flex justify-center text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200">
        <FontAwesomeIcon icon={faWarning} className="ml-2 mr-3 pt-1 text-2xl text-bunker-200" />{t("signup.step4-message")}
      </p>
      <div className="flex flex-col pb-2 bg-mineshaft-800 border border-mineshaft-600 items-center justify-center text-center lg:w-1/6 w-full md:min-w-[24rem] mt-8 max-w-md text-bunker-300 text-md rounded-md">
        <div className="w-full mt-4 md:mt-8 flex flex-row text-center items-center m-2 text-bunker-300 rounded-md lg:w-1/6 lg:w-1/6 w-full md:min-w-[23rem] px-3 mx-auto">
          <span className='mb-2'>{t("signup.step4-description1")} {t("signup.step4-description3")}</span>
        </div>
        <div className="flex flex-col items-center px-3 justify-center mt-0 md:mt-4 mb-2 md:mb-4 lg:w-1/6 w-full md:min-w-[20rem] mt-2 md:max-w-md mx-auto text-sm text-center md:text-left">
          <div className="text-l py-1 text-lg w-full">
            <Button
              onClick={async () => {
                await issueBackupKey({
                  email,
                  password,
                  personalName: name,
                  setBackupKeyError: () => { },
                  setBackupKeyIssued: () => { }
                });

                router.push(`/org/${localStorage.getItem("orgData.id")}/overview`);
              }}
              size="sm"
              isFullWidth
              className='h-12'
              colorSchema="primary"
              variant="outline_bg"
            > Download PDF </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
