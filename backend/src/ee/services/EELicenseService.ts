/**
 * Class to handle Enterprise Edition license actions
 */
class EELicenseService {
    
    private readonly _isLicenseValid: boolean;
    
    constructor(licenseKey: string) {
        this._isLicenseValid = true;
    }

    public get isLicenseValid(): boolean {
        return this._isLicenseValid;
    }
}

export default new EELicenseService('N/A');