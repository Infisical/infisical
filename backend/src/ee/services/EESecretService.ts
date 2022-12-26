import { ISecretVersion } from '../models';
import { 
    takeSecretSnapshotHelper,
    addSecretVersionsHelper
} from '../helpers/secret';
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
        workspaceId
    }: {
        workspaceId: string;
    }) {
        if (!EELicenseService.isLicenseValid) return;
        await takeSecretSnapshotHelper({ workspaceId });
    }
    
    /**
     * Adds secret versions [secretVersions] to the SecretVersion collection.
     * @param {Object} obj
     * @param {SecretVersion} obj.secretVersions
     */
    static async addSecretVersions({
        secretVersions
    }: {
        secretVersions: ISecretVersion[];
    }) {
        if (!EELicenseService.isLicenseValid) return;
        await addSecretVersionsHelper({
            secretVersions
        });
    }
}

export default EESecretService;