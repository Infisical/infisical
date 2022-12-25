/**
 * Class to handle Enterprise Edition license actions
 */
class EELicenseService {
    /**
     * Check if license key [licenseKey] corresponds to a
     * valid Infisical Enterprise Edition license.
     * @param {Object} obj
     * @param {Object} obj.licenseKey
     * @returns {Boolean}
     */
    static async checkLicense({
        licenseKey
    }: {
        licenseKey: string;
    }) {
        // TODO
        return true;
    }
}

export default EELicenseService;