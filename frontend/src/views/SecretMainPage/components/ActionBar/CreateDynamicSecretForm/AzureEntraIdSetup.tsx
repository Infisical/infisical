import {
    Button,
} from "@app/components/v2";

type Props = {
    onCompleted: () => void;
    onCancel: () => void;
};

export const AzureEntraIdSetup = ({
    onCompleted,
    onCancel,
}: Props) => {

    return (
        <div>
            <div>
                <div>
                    <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
                        App Installation
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center space-x-2">
                            Step 1: Click install app to install the Infisical Azure Entra ID App.
                            <br />
                            Step 2: Choose an account with admin access to Entra Id.
                            <br />
                            Step 3: Allow Infisical persmissions to read and write all users full profiles.
                        </div>
                    </div>
                </div>

                <div>
                    <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
                        Role Configuration
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center space-x-2">
                            Step 1: Open the Azure Entra Id dashboard.
                            <br />
                            Step 2: Go to Roles and admins {">"} User Administrator Role {">"} + Add Assignments.
                            <br />
                            Step 3: Search Infisical {">"} Click on Infisical Enterprise App {">"} Click Add.
                            <br />
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-4 flex items-center space-x-4">
                <Button type="submit" onClick={onCompleted}>
                    {/* <Link target="_blank" href="https://login.microsoftonline.com/common/adminconsent?client_id=9805c35f-88d4-4625-9daf-66f741e4129c&redirect_uri=https://meet-dev.in.ngrok.io" content="Link" > */}
                    Install App
                    {/* </Link> */}
                </Button>
                <Button variant="outline_bg" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </div>
    );
};
