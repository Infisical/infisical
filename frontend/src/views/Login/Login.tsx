import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios"

import { fetchUserDetails } from "@app/hooks/api/users/queries";
import getOrganizations from "@app/pages/api/organization/getOrgs";
import { getAuthToken, isLoggedIn } from "@app/reactQuery";

import { 
    InitialStep,
    MFAStep,
    SAMLSSOStep
} from "./components";

export const Login = () => {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    
    const queryParams = new URLSearchParams(window.location.search)
    
    useEffect(() => {
    // TODO(akhilmhdh): workspace will be controlled by a workspace context
    const redirectToDashboard = async () => {
      try {
        const userOrgs = await getOrganizations();
        // userWorkspace = userWorkspaces[0] && userWorkspaces[0]._id;
        const userOrg = userOrgs[0] && userOrgs[0]._id;

        // user details
        const userDetails = await fetchUserDetails()
        // send details back to client

        if (queryParams && queryParams.get("callback_port")) {
          const callbackPort = queryParams.get("callback_port")

          // send post request to cli with details
          const cliUrl = `http://localhost:${callbackPort}`
          const instance = axios.create()
          await instance.post(cliUrl, { email: userDetails.email, privateKey: localStorage.getItem("PRIVATE_KEY"), JTWToken: getAuthToken() })
        }
        router.push(`/org/${userOrg}/overview`);
      } catch (error) {
        console.log("Error - Not logged in yet");
      }
    };
    if (isLoggedIn()) {
      redirectToDashboard();
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
                return (
                    <SAMLSSOStep setStep={setStep} />
                );
            
            default:
                return <div />;
        }
    }
    
    return (
        <div>
            {renderView()}
        </div>
    );
}