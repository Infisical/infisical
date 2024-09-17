import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { IconButton } from "@app/components/v2";

export const AzureEntraIdCallbackPage = () => {
    const router = useRouter();
    return (
        <div className="flex h-screen flex-col justify-between overflow-auto bg-gradient-to-tr from-mineshaft-700 to-bunker-800 text-gray-200 dark:[color-scheme:dark]">
            <div />
            <div className="mx-auto w-full max-w-xl px-4 py-4 md:px-0">
                <div className="mb-8 text-center">
                    <div className="mb-4 flex justify-center pt-8">
                        <Link href="https://infisical.com">
                            <Image
                                src="/images/gradientLogo.svg"
                                height={90}
                                width={120}
                                alt="Infisical logo"
                                className="cursor-pointer"
                            />
                        </Link>
                    </div>
                    <h1 className="bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-4xl font-medium text-transparent">
                        Installed Entra Id App successfully
                    </h1>

                </div>
                <div className="m-auto my-8 flex w-full">
                    <div className="w-full border-t border-mineshaft-600" />
                </div>
                <div className="m-auto flex w-full flex-col rounded-md border border-primary-500/30 bg-primary/5 p-6 pt-5">
                    <div className="flex flex-col items-start sm:flex-row sm:items-center">
                        <p className="md:text-md text-md mr-4">
                            <p
                                className="text-bold bg-gradient-to-tr from-yellow-500 to-primary-500 bg-clip-text text-transparent"
                            >
                                Tenant ID
                            </p>{" "}
                            <br />
                            <div className="mr-2 flex items-center justify-end rounded-md bg-white/[0.05] p-2 text-base text-gray-400">
                                <p className="mr-4 break-all">{router.query.tenant}</p>
                                <IconButton
                                    ariaLabel="copy icon"
                                    colorSchema="secondary"
                                    className="group relative ml-2"
                                    onClick={() => {
                                        if (typeof router.query.tenant === "string") {
                                            navigator.clipboard.writeText(router.query.tenant);
                                            createNotification({
                                                title: "Copied Tenant ID to clipboard succesfully",
                                                type: "success",
                                                text: ""
                                            });
                                        }
                                    }}
                                >
                                    <FontAwesomeIcon icon={faCopy} />
                                </IconButton>
                            </div>
                        </p>
                    </div>
                </div>
            </div>
            <div className="w-full bg-mineshaft-600 p-2" />
        </div>
    )
}