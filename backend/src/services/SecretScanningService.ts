import { 
    createGitSecretBlindIndexDataHelper, 
    createGitSecretBlindIndexWithSaltHelper, 
    createGitSecretBlindIndexesWithSaltHelper,
    createGitSecretsHelper,
    getGitSecretBlindIndexSaltHelper, 
    getGitSecretsHelper,
    updateGitSecretHelper,
    updateGitSecretsHelper
} from "../helpers/secretScanning";
import { 
  CreateGitSecretBlindIndexDataParams, 
  CreateGitSecretBlindIndexWithSaltParams, 
  CreateGitSecretBlindIndexesWithSaltParams, 
  CreateGitSecretsParams, 
  GetGitSecretBlindIndexSaltParams, 
  GetGitSecretsParams, 
  UpdateGitSecretParams, 
  UpdateGitSecretsParams
 } from "../interfaces/services/SecretScanningService";
import { IGitSecret } from "../models";

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
   * Check if there is already a Git secret blind index for the Git secret findings [gitSecrets]
   * @param {Object} obj
   * @param {String[]} obj.gitSecrets - raw Git secret values from the Infisical Radar scan
   * @param {String} obj.salt - 16-byte random salt tied to the GitHub organization that is connected to Infisical Radar
   * @returns {Promise<string[]>} - A Promise that resolves to the generated Git secret blind indexes.
   */
  static async createGitSecretBlindIndexesWithSalt({
    gitSecrets,
    salt
  }: CreateGitSecretBlindIndexesWithSaltParams): Promise<string[]> {
    return await createGitSecretBlindIndexesWithSaltHelper({
      gitSecrets,
      salt
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
   * Create encrypted Git secrets and corresponding blind indexes
   * @param {Object} obj
   * @param {Set<string>|string[]} obj.gitSecrets - raw values of the Git secrets found in the Infisical Radar scan
   * @param {String[]} obj.gitSecretBlindIndexes - Git secret blind indexes
   * @param {String} obj.organizationId - Infisical id for the GitHub organization connected to Infisical Radar
   * @param {String} obj.salt - 16-byte random salt tied to the GitHub organization connected to Infisical Radar
   * @returns {Promise<string[]>} - A Promise that resolves to the generated Git secret blind indexes.
   */
  static async createGitSecrets({
    gitSecrets,
    gitSecretBlindIndexes,
    organizationId,
    salt,
    status
  }: CreateGitSecretsParams): Promise<string[]> {
    return await createGitSecretsHelper({
      gitSecrets,
      gitSecretBlindIndexes,
      organizationId,
      salt,
      status
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

  /**
   * Get bulk encrypted & hashed Git secret findings [gitSecrets] by Git risk status [status] (if provided) for the GitHub organization
   * connected to Infisical Radar [organizationId]
   * @param {Object} obj
   * @param {String} obj.organizationId - Infisical organization ID of the GitHub organization connected to Infisical Radar
   * @returns {Promise<IGitSecret[]>} - A Promise that resolves to the Git secrets that match the criteria.
   */
  static async getGitSecrets({
    organizationId,
    status
  }: GetGitSecretsParams): Promise<IGitSecret[]> {
    return await getGitSecretsHelper({
      organizationId,
      status
    });
  }

  /**
   * Update Git risk status [status] of bulk Git secret findings [gitRisks]
   * @param {Object} obj
   * @param {String} obj.gitSecretBlindIndex - value of the Git secret finding to update
   * @param {String} obj.organizationId - Infisical organization ID of the GitHub organization connected to Infisical Radar
   * @param {RiskStatus} obj.status - Git risk status of the Git secret finding to update
   */
  static async updateGitSecret({
    gitSecretBlindIndex,
    organizationId,
    status,
  }: UpdateGitSecretParams): Promise<void> {
    return await updateGitSecretHelper({
      gitSecretBlindIndex,
      organizationId,
      status,
    });
  }

  /**
   * Update Git risk status [status] of bulk Git secret findings [gitRisks]
   * @param {Object} obj
   * @param {Set<string>} obj.gitSecretBlindIndexes - unique Git secret blind indexes to update
   * @param {String} obj.organizationId - Infisical organization ID of the GitHub organization connected to Infisical Radar
   * @param {RiskStatus} obj.status - Git risk status of the Git secret finding to update
   */
  static async updateGitSecrets({
    gitSecretBlindIndexes,
    organizationId,
    status,
  }: UpdateGitSecretsParams): Promise<void> {
    return await updateGitSecretsHelper({
      gitSecretBlindIndexes,
      organizationId,
      status,
    });
  }
}

export default SecretScanningService;
