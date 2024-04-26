import { useState } from "react";
import jwt_decode from "jwt-decode";

import {
  BackupPDFStep,
  EmailConfirmationStep,
  MergeUsersStep,
  UserInfoSSOStep} from "./components";

type Props = {
  providerAuthToken: string;
};

export const SignupSSO = ({ providerAuthToken }: Props) => {
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState("");

  const { username, email, organizationName, firstName, lastName } = jwt_decode(
    providerAuthToken
  ) as any;

  const renderView = () => {
    switch (step) {
      case 0:
        return (
          <UserInfoSSOStep
            username={username}
            email={email}
            name={`${firstName} ${lastName}`}
            providerOrganizationName={organizationName}
            password={password}
            setPassword={setPassword}
            setStep={setStep}
            providerAuthToken={providerAuthToken}
          />
        );
      case 1:
        return <EmailConfirmationStep email={email} setStep={setStep} />;
      case 2:
        return <MergeUsersStep username={username} />;
      case 3:
        return (
          <BackupPDFStep email={username} password={password} name={`${firstName} ${lastName}`} />
        );
      default:
        return <div />;
    }
  };

  return <div>{renderView()}</div>;
};
