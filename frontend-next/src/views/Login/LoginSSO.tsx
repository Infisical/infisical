import { useEffect, useState } from "react";
import jwt_decode from "jwt-decode";

import { PasswordStep } from "./components";

type Props = {
  providerAuthToken: string;
};

export const LoginSSO = ({ providerAuthToken }: Props) => {
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState("");

  const { username, isUserCompleted } = jwt_decode(providerAuthToken) as any;

  useEffect(() => {
    if (isUserCompleted) {
      setStep(1);
    }
  }, []);

  const renderView = () => {
    switch (step) {
      case 0:
        return <div />;
      case 1:
        return (
          <PasswordStep
            providerAuthToken={providerAuthToken}
            email={username}
            password={password}
            setPassword={setPassword}
          />
        );
      default:
        return <div />;
    }
  };

  return <div>{renderView()}</div>;
};
