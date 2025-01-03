import { useTranslation } from "react-i18next";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import issueBackupKey from "@app/components/utilities/cryptography/issueBackupKey";
import { Button } from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/workspace/types";

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
export const BackupPDFStep = ({ email, password, name }: DownloadBackupPDFStepProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="mx-auto mb-36 flex h-full w-full flex-col items-center md:mb-16 md:px-6">
      <p className="flex justify-center bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
        <FontAwesomeIcon icon={faWarning} className="ml-2 mr-3 pt-1 text-2xl text-bunker-200" />
        {t("signup.step4-message")}
      </p>
      <div className="text-md mt-8 flex w-full max-w-md flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-800 pb-2 text-center text-bunker-300 md:min-w-[24rem] lg:w-1/6">
        <div className="m-2 mx-auto mt-4 flex w-full flex-row items-center rounded-md px-3 text-center text-bunker-300 md:mt-8 md:min-w-[23rem] lg:w-1/6">
          <span className="mb-2">
            {t("signup.step4-description1")} {t("signup.step4-description3")}
          </span>
        </div>
        <div className="mx-auto mb-2 mt-2 flex w-full flex-col items-center justify-center px-3 text-center text-sm md:mb-4 md:mt-4 md:min-w-[20rem] md:max-w-md md:text-left lg:w-1/6">
          <div className="text-l w-full py-1 text-lg">
            <Button
              onClick={async () => {
                await issueBackupKey({
                  email,
                  password,
                  personalName: name,
                  setBackupKeyError: () => {},
                  setBackupKeyIssued: () => {}
                });

                navigate({
                  to: `/organization/${ProjectType.SecretManager}/overview` as const
                });
              }}
              size="sm"
              isFullWidth
              className="h-12"
              colorSchema="primary"
              variant="outline_bg"
            >
              {" "}
              Download PDF{" "}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
