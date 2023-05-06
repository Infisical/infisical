import { useTranslation } from 'react-i18next';
import Link from 'next/link';

import { getTranslatedStaticProps } from '@app/components/utilities/withTranslateProps';

export default function InitialLoginStep({
    setIsLoginWithEmail,
}: {
    setIsLoginWithEmail: (value: boolean) => void;
}) {

    const { t } = useTranslation();

    return <div className='flex flex-col mx-auto w-full justify-center items-center'>
        <h1 className=' text-white text-center mb-5' >Login to Infisical</h1>
        <div className='lg:w-1/5 w-1/3  bg-primary text-center p-3 rounded-md'>
            <button type='button' className='text-black' onClick={() => {
                window.open('/api/v1/oauth/redirect/google')
            }}>
                {t('login:continue-with-google')}
            </button>
        </div>
        <div className='lg:w-1/5 w-1/3 bg-chicago-900 text-center p-3 rounded-md mt-4'>
            <button type='button' className='text-white' onClick={() => {
                setIsLoginWithEmail(true);
            }}>
                {t('login:continue-with-email')}
            </button>
        </div>
        <Link href="/signup">
            <button type="button" className='text-white mt-8 underline'>
                {t('login:create-account')}
            </button>
        </Link>
    </div>
}

export const getStaticProps = getTranslatedStaticProps(['login']);
