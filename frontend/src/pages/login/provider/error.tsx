import { useEffect } from "react";

export default function LoginProviderError() {
    useEffect(() => {
        window.localStorage.setItem("PROVIDER_AUTH_ERROR", "err");
        window.close();
    }, [])

    return <div />
}
