/* eslint-disable @typescript-eslint/no-unused-vars */
import Head from 'next/head';

export default function NewServiceAccountPage() {
    console.log('NewServiceAccountPage');
    return (
        <div>
        <Head>
            <title>Some title</title>
            <link rel="icon" href="/infisical.ico" />
        </Head>
        <div>
            Hello!
        </div>
        {/* <OrgSettingsPage /> */}
        </div>
    );
}

// NewServiceAccountPage.requireAuth = true;