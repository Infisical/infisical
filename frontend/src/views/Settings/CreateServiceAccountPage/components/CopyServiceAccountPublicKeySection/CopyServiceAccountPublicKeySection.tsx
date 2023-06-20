import { useEffect } from "react";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { useGetServiceAccountById } from "@app/hooks/api";

type Props = {
    serviceAccountId: string;
}

export const CopyServiceAccountPublicKeySection = ({ serviceAccountId }: Props): JSX.Element => {
    const { data: serviceAccount } = useGetServiceAccountById(serviceAccountId);
    const [isServiceAccountIdCopied, setIsServiceAccountIdCopied] = useToggle(false);

    useEffect(() => {
        let timer: NodeJS.Timeout;

        if (isServiceAccountIdCopied) {
            timer = setTimeout(() => setIsServiceAccountIdCopied.off(), 2000);
        }

        return () => clearTimeout(timer);
    }, [isServiceAccountIdCopied]);

    const copyServiceAccountIdToClipboard = () => {
        if (!serviceAccount) return;

        navigator.clipboard.writeText(serviceAccount.publicKey);
        setIsServiceAccountIdCopied.on();
    };

    return serviceAccount ? (
       <div className="flex w-full flex-col items-start rounded-md bg-white/5 px-6 p-6">
            <p className="text-xl font-semibold">Public Key</p>
            <div className="mt-4 flex items-center justify-end rounded-md bg-white/[0.07] text-base text-gray-400 p-2">
                <p className="mr-4 break-all">{serviceAccount.publicKey}</p>
                <IconButton
                    ariaLabel="copy icon"
                    colorSchema="secondary"
                    className="group relative"
                    onClick={() => copyServiceAccountIdToClipboard()}
                >
                <FontAwesomeIcon icon={isServiceAccountIdCopied ? faCheck : faCopy} />
                    <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                        Copy
                    </span>
                </IconButton>
            </div>
        </div>
    ) : <div />
}