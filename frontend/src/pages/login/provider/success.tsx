import { useEffect } from "react";
import { useRouter } from "next/router"

import SecurityClient from "@app/components/utilities/SecurityClient";

export default function LoginProviderSuccess() {
    const router = useRouter();

    useEffect(() => {
        const { token } = router.query;
        SecurityClient.setProviderAuthToken(token as string);
        window.close();
    }, [])

    return <div />
}
