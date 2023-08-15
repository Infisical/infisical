import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useRouter } from "next/router";
import { faGithub,faGoogle } from "@fortawesome/free-brands-svg-icons";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios"

import Error from "@app/components/basic/Error";
import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import attemptCliLogin from "@app/components/utilities/attemptCliLogin";
import attemptLogin from "@app/components/utilities/attemptLogin";
import { Button, Input } from "@app/components/v2";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

type Props = {
    setStep: (step: number) => void;
    email: string;
    setEmail: (email: string) => void;
    password: string;
    setPassword: (email: string) => void;
}

export const InitialStep = ({
    setStep,
    email,
    setEmail,
    password,
    setPassword
}: Props) => {
    const router = useRouter();
    const { createNotification } = useNotificationContext();
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);
    const [loginError, setLoginError] = useState(false);
    const { data: serverDetails } = useFetchServerStatus();
    const queryParams = new URLSearchParams(window.location.search);

    const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        try {
            if (!email || !password) {
                return;
            }

            const sanitizedEmail = email.toLowerCase();

            setIsLoading(true);
            if (queryParams && queryParams.get("callback_port")) {
                const callbackPort = queryParams.get("callback_port")

                // attemptCliLogin
                const isCliLoginSuccessful = await attemptCliLogin({
                    email: sanitizedEmail,
                    password,
                })

                if (isCliLoginSuccessful && isCliLoginSuccessful.success) {

                    if (isCliLoginSuccessful.mfaEnabled) {
                        // case: login requires MFA step
                        setStep(1);
                        setIsLoading(false);
                        return;
                    }
                    // case: login was successful
                    const cliUrl = `http://localhost:${callbackPort}`

                    // send request to server endpoint
                    const instance = axios.create()
                    await instance.post(cliUrl, { ...isCliLoginSuccessful.loginResponse })

                    // cli page
                    router.push("/cli-redirect");

                    // on success, router.push to cli Login Successful page

                }
            } else {
                const isLoginSuccessful = await attemptLogin({
                    email: sanitizedEmail,
                    password,
                });
                if (isLoginSuccessful && isLoginSuccessful.success) {
                    // case: login was successful

                    if (isLoginSuccessful.mfaEnabled) {
                        // case: login requires MFA step
                        setStep(1);
                        setIsLoading(false);
                        return;
                    }
                    const userOrgs = await fetchOrganizations();
                    const userOrg = userOrgs[0] && userOrgs[0]._id;

                    // case: login does not require MFA step
                    createNotification({
                        text: "Successfully logged in",
                        type: "success"
                    });
                    router.push(`/org/${userOrg}/overview`);
                }
            }


        } catch (err) {
            setLoginError(true);
            createNotification({
                text: "Login unsuccessful. Double-check your credentials and try again.",
                type: "error"
            });
        }

        setIsLoading(false);
    }

    return (
        <form onSubmit={handleLogin} className='flex flex-col mx-auto w-full justify-center items-center'>
            <h1 className='text-xl font-medium text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200 text-center mb-8' >Login to Infisical</h1>
            <div className='lg:w-1/6 w-1/4 min-w-[21.2rem] md:min-w-[20.1rem] text-center rounded-md mt-4'>
                <Button
                    colorSchema="primary" 
                    variant="outline_bg"
                    onClick={() => {
                        const callbackPort = queryParams.get("callback_port");
                        
                        window.open(`/api/v1/sso/redirect/google${callbackPort ? `?callback_port=${callbackPort}` : ""}`);
                        window.close();
                    }} 
                    leftIcon={<FontAwesomeIcon icon={faGoogle} className="mr-2" />}
                    className="h-11 w-full mx-0"
                > 
                    {t("login.continue-with-google")}
                </Button>
            </div>
            <div className='lg:w-1/6 w-1/4 min-w-[21.2rem] md:min-w-[20.1rem] text-center rounded-md mt-4'>
                <Button
                    colorSchema="primary" 
                    variant="outline_bg"
                    onClick={() => {
                        const callbackPort = queryParams.get("callback_port");
                        
                        window.open(`/api/v1/sso/redirect/github${callbackPort ? `?callback_port=${callbackPort}` : ""}`);
                        
                        window.close();
                    }} 
                    leftIcon={<FontAwesomeIcon icon={faGithub} className="mr-2" />}
                    className="h-11 w-full mx-0"
                > 
                    Continue with GitHub
                </Button>
            </div>
            <div className='lg:w-1/6 w-1/4 min-w-[21.2rem] md:min-w-[20.1rem] text-center rounded-md mt-4'>
                <Button
                    colorSchema="primary"
                    variant="outline_bg"
                    onClick={() => {
                        setStep(2);
                    }}
                    leftIcon={<FontAwesomeIcon icon={faLock} className="mr-2" />}
                    className="h-11 w-full mx-0"
                >
                    Continue with SSO
                </Button>
            </div>
            <div className='lg:w-1/6 w-1/4 min-w-[20rem] flex flex-row items-center my-4 py-2'>
                <div className='w-full border-t border-mineshaft-400/60' /> 
                <span className="mx-2 text-mineshaft-200 text-xs">or</span>
                <div className='w-full border-t border-mineshaft-400/60' />
            </div>
            <div className='lg:w-1/6 w-1/4 min-w-[21.2rem] md:min-w-[20.1rem] text-center rounded-md'>
                <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="Enter your email..."
                    isRequired
                    autoComplete="username"
                    className="h-11"
                />
            </div>
            <div className='lg:w-1/6 w-1/4 min-w-[21.2rem] md:min-w-[20.1rem] text-center rounded-md mt-4'>
                <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="Enter your password..."
                    isRequired
                    autoComplete="current-password"
                    id="current-password"
                    className="h-11 select:-webkit-autofill:focus"
                />
            </div>
            <div className='lg:w-1/6 w-1/4 min-w-[21.2rem] md:min-w-[20.1rem] text-center rounded-md mt-5'>
                <Button
                    type="submit"
                    size="sm"
                    isFullWidth
                    className='h-11'
                    colorSchema="primary"
                    variant="solid"
                    isLoading={isLoading}
                > Continue with Email </Button>
            </div>
            {!isLoading && loginError && <Error text={t("login.error-login") ?? ""} />}
            {
                !serverDetails?.inviteOnlySignup ?
                <div className="mt-6 text-bunker-400 text-sm flex flex-row">
                    <span className="mr-1">Don&apos;t have an acount yet?</span>
                    <Link href="/signup">
                        <span className='hover:underline hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer'>{t("login.create-account")}</span>
                    </Link>
                </div> : <div />
            }
            <div className="text-bunker-400 text-sm flex flex-row">
                <span className="mr-1">Forgot password?</span>
                <Link href="/verify-email">
                    <span className='hover:underline hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer'>Recover your account</span>
                </Link>
            </div>
        </form>
    );
}