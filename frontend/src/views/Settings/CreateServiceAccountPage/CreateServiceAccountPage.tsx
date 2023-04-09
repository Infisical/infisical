import { useRouter } from 'next/router';

import NavHeader from '@app/components/navigation/NavHeader';

import { SAProjectLevelPermissionsTable } from './components/SAProjectLevelPermissionsTable';
import {
    CopyServiceAccountIDSection,
    ServiceAccountNameChangeSection} from './components';

export const CreateServiceAccountPage = () => {
    const router = useRouter();
    const {serviceAccountId} = router.query;

    return (
        <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
            <NavHeader 
                pageName="Service Account" 
                isOrganizationRelated
            />
            <div className="my-8 ml-6 max-w-5xl">
                <p className="text-3xl font-semibold text-gray-200">Service Account</p>
                <p className="text-base font-normal text-gray-400">
                    A service account represents a machine identity such as a VM or application client.
                </p>
            </div>
            {typeof serviceAccountId === 'string' && (
                <div className="max-w-8xl mx-6">
                    <ServiceAccountNameChangeSection 
                        serviceAccountId={serviceAccountId}
                    />
                    <div className="mt-8">
                        <CopyServiceAccountIDSection 
                            serviceAccountId={serviceAccountId}
                        />
                    </div>
                    <div className="mt-8">
                        <SAProjectLevelPermissionsTable 
                            serviceAccountId={serviceAccountId}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}