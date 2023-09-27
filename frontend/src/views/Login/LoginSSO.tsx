import { useEffect, useState } from "react";
import jwt_decode from "jwt-decode";

import {
    MfaAuthAppSecretKeyStep,
    MfaAuthAppTotpStep,
    MfaEmailStep,
    MfaRecoveryCodeStep,
    MfaSelectionStep,
    PasswordStep,
} from "./components";

type Props = { 
    providerAuthToken: string;
}

export const LoginSSO = ({ providerAuthToken }: Props) => {
    const [step, setStep] = useState(0);
    const [password, setPassword] = useState("");

    const {
        email,
        isUserCompleted
    } = jwt_decode(providerAuthToken) as any;
    
    useEffect(() => {
        if (isUserCompleted) {
            setStep(1);
        }
    }, []);
    
    const renderView = () => {
        switch (step) {
            case 0:
                return (
                    <div />
                );
            case 1:
                return (
                    <PasswordStep 
                        providerAuthToken={providerAuthToken}
                        email={email}
                        password={password}
                        setPassword={setPassword}
                        setStep={setStep}
                    />
                );
            case 2:
                return (
                    <MfaSelectionStep
                        setStep={setStep} 
                    />
                );
            case 3:
                return (
                    <MfaEmailStep 
                        email={email}
                        password={password}
                        providerAuthToken={undefined}
                        setStep={setStep} 
                    />
                );
            case 4:
                return (
                    <MfaAuthAppTotpStep 
                        email={email}
                        password={password}
                        providerAuthToken={undefined}
                        setStep={setStep} 
                    />
                );
            case 5:
                return (
                    <MfaAuthAppSecretKeyStep 
                        email={email}
                        password={password}
                        providerAuthToken={undefined}
                        setStep={setStep} 
                    />
                );
            case 6:
                return (
                    <MfaRecoveryCodeStep 
                        email={email}
                        password={password}
                        providerAuthToken={undefined}
                        setStep={setStep} 
                    />
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