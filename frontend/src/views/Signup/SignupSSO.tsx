import { useEffect, useState } from "react";
import jwt_decode from "jwt-decode";

import { BackupPDFStep, EmailConfirmationStep, UserInfoSSOStep } from "./components";

type Props = {
  providerAuthToken: string;
};

export const SignupSSO = ({ providerAuthToken }: Props) => {
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState("");

  const {
    username,
    email,
    organizationName,
    organizationSlug,
    firstName,
    lastName,
    authType,
    isEmailVerified
  } = jwt_decode(providerAuthToken) as any;

  useEffect(() => {
    if (!isEmailVerified) {
      setStep(0);
    } else {
      setStep(1);
    }
  }, []);

  const renderView = () => {
    switch (step) {
      case 0:
        return (
          <EmailConfirmationStep
            authType={authType}
            username={username}
            email={email}
            organizationSlug={organizationSlug}
            setStep={setStep}
          />
        );
      case 1:
        return (
          <UserInfoSSOStep
            username={username}
            name={`${firstName} ${lastName}`}
            providerOrganizationName={organizationName}
            password={password}
            setPassword={setPassword}
            setStep={setStep}
            providerAuthToken={providerAuthToken}
          />
        );
      case 2:
        return (
          <BackupPDFStep email={username} password={password} name={`${firstName} ${lastName}`} />
        );
      default:
        return <div />;
    }
  };

  return <div>{renderView()}</div>;
};
