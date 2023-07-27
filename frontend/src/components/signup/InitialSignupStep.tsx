import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useRouter } from "next/router";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "../v2";

export default function InitialSignupStep({
    setIsSignupWithEmail,
}: {
    setIsSignupWithEmail: (value: boolean) => void
}) {
    const { t } = useTranslation();
    const router = useRouter();

    return <div className='flex flex-col mx-auto w-full justify-center items-center'>
        <h1 className='text-xl font-medium text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200 text-center mb-8' >{t("signup.initial-title")}</h1>
        <div className='lg:w-1/6 w-1/4 min-w-[20rem] rounded-md'>
            <Button
                colorSchema="primary"
                variant="solid"
                onClick={() => {
                    window.open("/api/v1/sso/redirect/google");
                    window.close();
                }}
                leftIcon={<FontAwesomeIcon icon={faGoogle} className="mr-1" />}
                className="h-14 w-full mx-0"
            >
                {t("signup.continue-with-google")}
            </Button>
        </div>
        <div className='lg:w-1/6 w-1/4 min-w-[20rem] text-center rounded-md mt-4'>
            <Button
                colorSchema="primary"
                variant="outline_bg"
                onClick={() => {
                    setIsSignupWithEmail(true);
                }}
                isFullWidth
                className="h-14 w-full mx-0"
            >
                Sign Up with email
            </Button>
        </div>
        <div className='lg:w-1/6 w-1/4 min-w-[20rem] text-center rounded-md mt-4'>
            <Button
                colorSchema="primary" 
                variant="outline_bg"
                onClick={() => router.push("/saml-sso")} 
                isFullWidth
                className="h-14 w-full mx-0"
            > 
                Continue with SAML SSO
            </Button>
        </div>
        <div className='lg:w-1/6 w-1/4 min-w-[20rem] px-8 text-center mt-6 text-xs text-bunker-400'>
            {t("signup.create-policy")}
        </div>
        <div className="mt-2 text-bunker-400 text-xs flex flex-row">
            <Link href="/login">
                <span className='hover:underline hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer'>{t("signup.already-have-account")}</span>
            </Link>
        </div>
    </div>
}
