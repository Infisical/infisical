import { takeSecretSnapshotHelper } from '../helpers/secret';
import EELicenseService from './EELicenseService';

/**
 * Class to handle Enterprise Edition secret actions
 */
class EESecretService {
    
    /**
     * Save a copy of the current state of secrets in workspace with id
     * [workspaceId] under a new snapshot with incremented version under the
     * SecretSnapshot collection.
     * Requires a valid license key [licenseKey]
     * @param {Object} obj
     * @param {String} obj.workspaceId
     */
    static async takeSecretSnapshot({
        licenseKey,
        workspaceId
    }: {
        licenseKey: string;
        workspaceId: string;
    }) {
        EELicenseService.checkLicense({ licenseKey });
        await takeSecretSnapshotHelper({ workspaceId });
    }
}

export default EESecretService;