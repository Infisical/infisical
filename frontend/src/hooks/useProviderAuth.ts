import { useEffect, useState } from 'react';
import jwt_decode from 'jwt-decode';

import SecurityClient, { PROVIDER_AUTH_TOKEN_KEY } from '@app/components/utilities/SecurityClient';

export const useProviderAuth = () => {
    const [email, setEmail] = useState<string>('');
    const [userId, setUserId] = useState<string>('');
    const [providerAuthToken, setProviderAuthToken] = useState<string>(
        SecurityClient.getProviderAuthToken() || ''
    );
    const [isProviderUserCompleted, setIsProviderUserCompleted] = useState<boolean>();

    useEffect(() => {
        const handleStorageChange = (event: StorageEvent) => {
            if (event.storageArea === localStorage && event.key === PROVIDER_AUTH_TOKEN_KEY) {
                if (event.newValue) {
                    const token = event.newValue;
                    const {
                        userId: resultUserId,
                        email: resultEmail,
                        isUserCompleted: resultIsUserCompleted,
                    } = jwt_decode(token) as any;
                    setIsProviderUserCompleted(resultIsUserCompleted);
                    setProviderAuthToken(token);
                    setEmail(resultEmail);
                    setUserId(resultUserId);
                } else {
                    setProviderAuthToken('');
                    setEmail('');
                    setUserId('');
                    setIsProviderUserCompleted(false);
                }
                setProviderAuthToken(event.newValue || '');
            }
        };

        window.addEventListener('storage', handleStorageChange);

        if (providerAuthToken) {
            const {
                userId: resultUserId,
                email: resultEmail,
                isUserCompleted: resultIsUserCompleted,
            } = jwt_decode(providerAuthToken) as any;
            setEmail(resultEmail);
            setUserId(resultUserId);
            setIsProviderUserCompleted(resultIsUserCompleted);
        }

        return () => {
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    return {
        email,
        isProviderUserCompleted,
        providerAuthToken,
        userId,
        setEmail,
        setProviderAuthToken,
        setUserId,
    };
};
