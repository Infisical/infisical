import Head from "next/head";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { usePopUp } from "@app/hooks";

import { AddLoginCredentialsModal } from "./AddLoginCredentialsModal";
import { LoginCredentialsTable } from "./LoginCredentialsTable";

export const UserSecretsSection = () => {
    const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["createUserLoginCredentials"] as const);
    return (
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <Head>
                <title>User Secrets</title>
                <link rel="icon" href="/infisical.ico" />
                <meta property="og:image" content="/images/message.png" />
            </Head> 
            <div className="mb-4 flex justify-between">
                <p className="text-xl font-semibold text-mineshaft-100">Login Credentials</p>
                <Button
                    colorSchema="primary"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    onClick={() => {
                        handlePopUpOpen("createUserLoginCredentials");
                    }}
                >
                    Create Secret
                </Button>
            </div> 
            <LoginCredentialsTable/>
            <AddLoginCredentialsModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
        </div>
    )
}

