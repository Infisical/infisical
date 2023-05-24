import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { Button } from '../v2';

export default function InitialLoginStep({
    setIsLoginWithEmail,
}: {
    setIsLoginWithEmail: (value: boolean) => void;
}) {

    const { t } = useTranslation();

    return <div className='flex flex-col mx-auto w-full justify-center items-center'>
        <h1 className='text-xl font-medium text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200 text-center mb-8' >Login to Infisical</h1>
        <div className='lg:w-1/6 w-1/4 min-w-[20rem] rounded-md'>
            <Button
                colorSchema="primary" 
                variant="solid"
                onClick={() => {
                    window.open('/api/v1/auth/redirect/google')
                }} 
                leftIcon={<FontAwesomeIcon icon={faGoogle} className="mr-1" />}
                className="h-14 w-full mx-0"
            > 
                {t('login.continue-with-google')}
            </Button>
        </div>
        <div className='lg:w-1/6 w-1/4 min-w-[20rem] text-center rounded-md mt-4'>
            <Button
                colorSchema="primary" 
                variant="outline_bg"
                onClick={() => {
                    setIsLoginWithEmail(true);
                }} 
                isFullWidth
                className="h-14 w-full mx-0"
            > 
                {t('login.continue-with-email')} 
            </Button>
        </div>
        <div className="mt-4 text-bunker-400 text-sm flex flex-row">
            <span className="mr-1">Don&apos;t have an acount yet?</span>
            <Link href="/signup">
                <span className='hover:underline hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer'>{t('login.create-account')}</span>
            </Link>
        </div>
    </div>
}
