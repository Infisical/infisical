import { useEffect, useState } from "react";
import { useRouter } from "next/router"
import jwt_decode from "jwt-decode";

import {
    MFAStep,
    PasswordStep
} from "./components";

type Props = { 
    providerAuthToken: string;
}

export const LoginSSO = ({ providerAuthToken }: Props) => {
    const [step, setStep] = useState(0);
    const [password, setPassword] = useState("");
    const router = useRouter();

    const {
        email,
        isUserCompleted,
    } = jwt_decode(providerAuthToken) as any;

    useEffect(() => {
        if (!isUserCompleted) {
            router.push(`/signup/sso?token=${encodeURIComponent(providerAuthToken)}`); 
        }
        
        if (isUserCompleted) {
            setStep(1);
        }
    }, []);
    
    const renderView = () => {
        // TODO: consider adding a complete account step here that's uniquely for SSO
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
                    <MFAStep 
                        providerAuthToken={providerAuthToken}
                        email={email}
                        password={password}
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