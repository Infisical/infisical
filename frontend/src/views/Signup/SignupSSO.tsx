import { useState } from "react";
import jwt_decode from "jwt-decode";

import {
    BackupPDFStep,
    UserInfoSSOStep} from "./components";

type Props = { 
    providerAuthToken: string;
}

export const SignupSSO = ({
    providerAuthToken
}: Props) => {
    const [step, setStep] = useState(0);
    const [password, setPassword] = useState("");

    const {
        email,
        organizationName,
        firstName,
        lastName
    } = jwt_decode(providerAuthToken) as any;

    const renderView = () => {
        switch (step) {
            case 0:
                return (
                    <UserInfoSSOStep 
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
                return (
                    <BackupPDFStep 
                        email={email}
                        password={password}
                        name={`${firstName} ${lastName}`}
                    />
                );
            default:
                return <div />
        }
    }
    
    return (
        <div>
            {renderView()}
        </div>
    );
}