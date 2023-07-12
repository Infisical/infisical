import { faBan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
    Button
} from "@app/components/v2";
import { useRevokeMySessions } from "@app/hooks/api";

import { SessionsTable } from "./SessionsTable";

export const SessionsSection = () => {
    const { mutateAsync } = useRevokeMySessions();
    
    const onRevokeAllSessionsClick = async () => {
        try {
            await mutateAsync();
            window.location.href = "/login";
        } catch (err) {
            console.error(err);
        }
    }
    
    return (
        <div className="p-4 mb-6 bg-mineshaft-900 rounded-lg border border-mineshaft-600">
            <div className="flex justify-between mb-8">
                <h2 className="text-xl font-semibold flex-1 text-mineshaft-100">
                    Sessions
                </h2>
               <Button
                    colorSchema="secondary"
                    type="submit"
                    leftIcon={<FontAwesomeIcon icon={faBan} />}
                    onClick={onRevokeAllSessionsClick}
                >
                    Revoke all
                </Button> 
            </div>
            <p className="text-gray-400 mb-8">
                Logging into Infisical via browser or CLI creates a session. Revoking all sessions logs your account out all active sessions across all browsers and CLIs.
            </p>
            <SessionsTable />
        </div>
    );
}