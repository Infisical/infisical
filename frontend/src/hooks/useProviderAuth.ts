import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import jwt_decode from "jwt-decode";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import SecurityClient, { PROVIDER_AUTH_TOKEN_KEY } from "@app/components/utilities/SecurityClient";

export const useProviderAuth = () => {
    const router = useRouter();
    const { providerAuthToken: redirectedProviderAuthToken } = router.query;
    const [email, setEmail] = useState<string>("");
    const [userId, setUserId] = useState<string>("");
    const [providerAuthToken, setProviderAuthToken] = useState<string>(
        redirectedProviderAuthToken as string || ""
    );
    const [isProviderUserCompleted, setIsProviderUserCompleted] = useState<boolean>();
    const { createNotification } = useNotificationContext();
    const AUTH_ERROR_KEY = "PROVIDER_AUTH_ERROR"

    const handleRedirectWithToken = () => {
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

    }

    useEffect(() => {
        handleRedirectWithToken();

        // reset when there is no redirect auth token
        if (!providerAuthToken) {
            SecurityClient.setProviderAuthToken("");
        }

        window.localStorage.removeItem(AUTH_ERROR_KEY);

        const handleStorageChange = (event: StorageEvent) => {
            if (event.storageArea !== localStorage) {
                return;
            }

            if (event.key === PROVIDER_AUTH_TOKEN_KEY) {
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
                    setProviderAuthToken("");
                    setEmail("");
                    setUserId("");
                    setIsProviderUserCompleted(false);
                }
                setProviderAuthToken(event.newValue || "");
            }

            if (event.key === AUTH_ERROR_KEY) {
                if (event.newValue) {
                    createNotification({
                        text: "An error has occured during login.",
                        type: "error",
                        timeoutMs: 6000,
                    })

                    window.localStorage.removeItem(AUTH_ERROR_KEY);
                }
            }
        };

        window.addEventListener("storage", handleStorageChange);

        return () => {
            window.removeEventListener("storage", handleStorageChange);
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
