import { useTranslation } from 'react-i18next';
import Link from 'next/link';

import { getTranslatedStaticProps } from '@app/components/utilities/withTranslateProps';

export default function InitialSignupStep({
    setIsSignupWithEmail,
}: {
    setIsSignupWithEmail: (value: boolean) => void
}) {
    const { t } = useTranslation();

    return <div className='flex flex-col mx-auto w-full justify-center items-center '>
        <h1 className=' text-white text-center mb-5' >{t('signup:initial-title')}</h1>
        <div className='lg:w-1/5 w-1/3 bg-primary text-center p-3 rounded-md'>
            <button type='button' className='text-black' onClick={() => {
                window.open('/api/v1/oauth/redirect/google')
            }}>
                {t('signup:continue-with-google')}
            </button>
        </div>
        <div className='lg:w-1/5 w-1/3 bg-chicago-900 text-center p-3 rounded-md mt-4'>
            <button type='button' className='text-white' onClick={() => {
                setIsSignupWithEmail(true);
            }}>
                {t('signup:continue-with-email')}
            </button>
        </div>
        <span className='text-white lg:w-1/6 w-1/3 text-xs mt-4 text-center'>{t('signup:create-policy')}</span>
        <Link href="/login">
            <button type="button" className='text-white mt-8 underline'>
                {t('signup:already-have-account')}
            </button>
        </Link>
    </div>
}

export const getStaticProps = getTranslatedStaticProps(['signup']);
