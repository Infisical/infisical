import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { isLoggedIn } from "@app/reactQuery";

import { InitialStep, MFAStep, SSOStep } from "./components";
import { navigateUserToSelectOrg } from "./Login.utils";

export const Login = () => {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const queryParams = new URLSearchParams(window.location.search);

  useEffect(() => {
    // TODO(akhilmhdh): workspace will be controlled by a workspace context
    const handleRedirects = async () => {
      try {
        const callbackPort = queryParams?.get("callback_port");
        // case: a callback port is set, meaning it's a cli login request: redirect to select org with callback port
        if (callbackPort) {
          navigateUserToSelectOrg(router, callbackPort);
        } else {
          // case: no callback port, meaning it's a regular login request: redirect to select org
          navigateUserToSelectOrg(router);
        }
      } catch (error) {
        console.log("Error - Not logged in yet");
      }
    };
    if (isLoggedIn()) {
      handleRedirects();
    }
  }, []);

  const renderView = () => {
    switch (step) {
      case 0:
        return (
          <InitialStep
            setStep={setStep}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
          />
        );
      case 1:
        return (
          <MFAStep
            email={email}
            password={password}
            providerAuthToken={undefined}
            callbackPort={queryParams.get("callback_port")}
          />
        );
      case 2:
        return <SSOStep setStep={setStep} type="SAML" />;
      case 3:
        return <SSOStep setStep={setStep} type="OIDC" />;
      default:
        return <div />;
    }
  };

  return <div>{renderView()}</div>;
};
