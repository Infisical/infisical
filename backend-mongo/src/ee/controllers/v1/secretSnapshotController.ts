import { ForbiddenError } from "@casl/ability";
import { Request, Response } from "express";
import { validateRequest } from "../../../helpers/validation";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../services/ProjectRoleService";
import * as reqValidator from "../../../validation/secretSnapshot";
import { ISecretVersion, SecretSnapshot, TFolderRootVersionSchema } from "../../models";

/**
 * Return secret snapshot with id [secretSnapshotId]
 * @param req
 * @param res
 * @returns
 */
export const getSecretSnapshot = async (req: Request, res: Response) => {
  const {
    params: { secretSnapshotId }
  } = await validateRequest(reqValidator.GetSecretSnapshotV1, req);

  const secretSnapshot = await SecretSnapshot.findById(secretSnapshotId)
    .lean()
    .populate<{ secretVersions: ISecretVersion[] }>({
      path: "secretVersions",
      populate: {
        path: "tags",
        model: "Tag"
      }
    })
    .populate<{ folderVersion: TFolderRootVersionSchema }>("folderVersion");

  if (!secretSnapshot) throw new Error("Failed to find secret snapshot");

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: secretSnapshot.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.SecretRollback
  );

  const folderId = secretSnapshot.folderId;
  // to show only the folder required secrets
  secretSnapshot.secretVersions = secretSnapshot.secretVersions.filter(
    ({ folder }) => folder === folderId
  );

  secretSnapshot.folderVersion = secretSnapshot?.folderVersion?.nodes?.children?.map(
    ({ id, name }) => ({
      id,
      name
    })
  ) as any;

  return res.status(200).send({
    secretSnapshot
  });
};
