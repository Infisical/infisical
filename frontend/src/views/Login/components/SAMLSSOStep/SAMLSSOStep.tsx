import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, Input } from "@app/components/v2";

type Props = {
    setStep: (step: number) => void;
}

export const SAMLSSOStep = ({
    setStep
}: Props) => {
    const [ssoIdentifier, setSSOIdentifier] = useState("");
    const { t } = useTranslation();

    const queryParams = new URLSearchParams(window.location.search);

    const handleSubmission = (e:React.FormEvent) => {
        e.preventDefault()
        const callbackPort = queryParams.get("callback_port");
        window.open(`/api/v1/sso/redirect/saml2/${ssoIdentifier}${callbackPort ? `?callback_port=${callbackPort}` : ""}`);
        window.close();
    }

    return (
        <div className="mx-auto w-full max-w-md md:px-6">
            <p className="mx-auto mb-6 flex w-max justify-center text-xl font-medium text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200 text-center mb-8">
                What&apos;s your SSO Identifier?
            </p>
            <form onSubmit={handleSubmission}>
            <div className="relative flex items-center justify-center lg:w-1/6 w-1/4 min-w-[20rem] md:min-w-[22rem] mx-auto w-full rounded-lg max-h-24 md:max-h-28">
                <div className="flex items-center justify-center w-full rounded-lg max-h-24 md:max-h-28">
                <Input
                    value={ssoIdentifier}
                    onChange={(e) => setSSOIdentifier(e.target.value)}
                    type="text"
                    placeholder="Enter your SSO identifier..."
                    isRequired
                    autoComplete="email"
                    id="email"
                    className="h-12"
                />
                </div>
            </div>
            <div className='lg:w-1/6 w-1/4 w-full mx-auto flex items-center justify-center min-w-[20rem] md:min-w-[22rem] text-center rounded-md mt-4'>
                <Button
                    type="submit" 
                    colorSchema="primary" 
                    variant="outline_bg"
                    isFullWidth
                    className="h-14"
                > 
                    {t("login.login")} 
                </Button>
            </div>
            </form>
            <div className="flex flex-row items-center justify-center mt-4">
                <button
                onClick={() => {
                    setStep(0);
                }}
                type="button"
                className="text-bunker-300 text-sm hover:underline mt-2 hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer"
                >
                {t("login.other-option")}
                </button>
            </div>
        </div>
    );
}