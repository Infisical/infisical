import { FC } from "react";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { RedirectButton } from "@app/helpers/redirectHelper";

export const Step3MfaEnabled: FC = () => {

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <p className="text-center text-xl font-semibold mb-6">
        Multi-factor authentication is now configured for your Infisical account!
      </p>
      <p className="text-center mb-6">
        Don&apos;t get locked out, configure additional authentication methods. Configuring additional authentication methods will help you gain access to your account in case you lose your device and don&apos;t have your recovery codes.
      </p>
      <RedirectButton 
        text="Done"
        redirectText="Redirecting to personal settings page..."
        path="/personal-settings" 
        leftIcon={<FontAwesomeIcon icon={faCheck} />}
      />
    </div>
  );
};
