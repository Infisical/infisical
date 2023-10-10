import { GitRisksEncryptionProperties } from "../ee/models";
import { 
  createGitSecretBlindIndexDataHelper, 
  createGitSecretBlindIndexWithSaltHelper, 
  encryptGitSecretHelper,
  getGitSecretBlindIndexSaltHelper, 
} from "../helpers/secretScanning";
import { 
  CreateGitSecretBlindIndexDataParams, 
  CreateGitSecretBlindIndexWithSaltParams, 
  EncryptGitSecretParams,
  GetGitSecretBlindIndexSaltParams, 
 } from "../interfaces/services/SecretScanningService";

class SecretScanningService {
  /**
   * Create secret blind index data containing encrypted blind index salt
   * for the GitHub organization's ID [organizationId].
   * @param {Object} obj - The input parameters for creating Git secret blind index data.
   * @param {String} obj.organizationId - GitHub organization's ID for Infisical Radar.
   * @returns {Promise<string>} - A Promise that resolves to the generated Git secret blind index salt for the organization.
   */
  static async createGitSecretBlindIndexData({
    organizationId,
  }: CreateGitSecretBlindIndexDataParams): Promise<string> {
    return await createGitSecretBlindIndexDataHelper({
      organizationId,
    });
  }

  /**
   * Generate blind index for the Git secret finding values [gitSecret]
   * and salt [salt]
   * @param {Object} obj
   * @param {String} obj.gitSecret - raw Git secret value from the Infisical Radar scan
   * @param {String} obj.salt - salted organization id for the GitHub organization connected to Infisical Radar
   * @returns {Promise<string>} - A Promise that resolves to the generated Git secret blind index.
   */
  static async createGitSecretBlindIndexWithSalt({
    gitSecret,
    salt
  }: CreateGitSecretBlindIndexWithSaltParams): Promise<string> {
    return await createGitSecretBlindIndexWithSaltHelper({
      gitSecret,
      salt
    });
  }

  /**
   * Create encrypted Git secret
   * @param {Object} obj
   * @param {String} obj.gitSecret - raw values of the Git secrets found in the Infisical Radar scan
   * @returns {Promise<GitRisksEncryptionProperties>} - A Promise that resolves to the encrypted Git secret data.
   */
  static async encryptGitSecret({
    gitSecret,
  }: EncryptGitSecretParams): Promise<GitRisksEncryptionProperties> {
    return await encryptGitSecretHelper({
      gitSecret,
    });
  }

  /**
   * Get secret blind index salt for organization's GitHub ID [organizationId]
   * @param {Object} obj
   * @param {String} obj.organizationId - Infisical id for the GitHub organization connected to Infisical Radar
   * @returns {Promise<string>} - A Promise that resolves to the Git secret blind index salt for the organization.
   */
  static async getGitSecretBlindIndexSalt({
    organizationId,
  }: GetGitSecretBlindIndexSaltParams): Promise<string> {
    return await getGitSecretBlindIndexSaltHelper({
      organizationId,
    });
  }
}

export default SecretScanningService;
