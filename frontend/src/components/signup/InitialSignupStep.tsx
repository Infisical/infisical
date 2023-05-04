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
        <div className=' w-1/5 bg-green text-center p-3 rounded-md'>
            <button type='button' className='text-black' onClick={() => {
                window.open('/api/v1/oauth/redirect/google')
            }}>
                {t('signup:continue-with-google')}
            </button>
        </div>
        <div className='w-1/5 bg-black text-center p-3 rounded-md mt-4'>
            <button type='button' className='text-white' onClick={() => {
                setIsSignupWithEmail(true);
            }}>
                {t('signup:continue-with-email')}
            </button>
        </div>
        <span className='text-white w-1/6 text-xs mt-4 text-center'>{t('signup:create-policy')}</span>
        <Link href="/login">
            <h2 className='text-white mt-8 underline'>{t('signup:already-have-account')}</h2>
        </Link>
    </div>
}

export const getStaticProps = getTranslatedStaticProps(['signup']);
