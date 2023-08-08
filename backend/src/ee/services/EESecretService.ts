import { Types } from "mongoose";
import { ISecretVersion } from "../models";
import {
  addSecretVersionsHelper,
  markDeletedSecretVersionsHelper,
  takeSecretSnapshotHelper,
} from "../helpers/secret";
import EELicenseService from "./EELicenseService";

/**
 * Class to handle Enterprise Edition secret actions
 */
export default class EESecretService {
  /**
   * Save a secret snapshot that is a copy of the current state of secrets in workspace with id
   * [workspaceId] under a new snapshot with incremented version under the
   * SecretSnapshot collection.
   * Requires a valid license key [licenseKey]
   * @param {Object} obj
   * @param {String} obj.workspaceId
   * @returns {SecretSnapshot} secretSnapshot - new secret snpashot
   */
  static async takeSecretSnapshot({
    workspaceId,
    environment,
    folderId,
  }: {
    workspaceId: Types.ObjectId;
    environment: string;
    folderId?: string;
  }) {
    if (!EELicenseService.isLicenseValid) return;
    return await takeSecretSnapshotHelper({
      workspaceId,
      environment,
      folderId,
    });
  }

  /**
   * Add secret versions [secretVersions] to the SecretVersion collection.
   * @param {Object} obj
   * @param {Object[]} obj.secretVersions
   * @returns {SecretVersion[]} newSecretVersions - new secret versions
   */
  static async addSecretVersions({
    secretVersions,
  }: {
    secretVersions: ISecretVersion[];
  }) {
    if (!EELicenseService.isLicenseValid) return;
    return await addSecretVersionsHelper({
      secretVersions,
    });
  }

  /**
   * Mark secret versions associated with secrets with ids [secretIds]
   * as deleted.
   * @param {Object} obj
   * @param {ObjectId[]} obj.secretIds - secret ids
   */
  static async markDeletedSecretVersions({
    secretIds,
  }: {
    secretIds: Types.ObjectId[];
  }) {
    if (!EELicenseService.isLicenseValid) return;
    await markDeletedSecretVersionsHelper({
      secretIds,
    });
  }
}
