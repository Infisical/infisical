import { Request, Response } from "express";
import * as Sentry from "@sentry/node";
import {
  ISecretVersion,
  SecretSnapshot,
  TFolderRootVersionSchema,
} from "../../models";

/**
 * Return secret snapshot with id [secretSnapshotId]
 * @param req
 * @param res
 * @returns
 */
export const getSecretSnapshot = async (req: Request, res: Response) => {
  let secretSnapshot;
  try {
    const { secretSnapshotId } = req.params;

    secretSnapshot = await SecretSnapshot.findById(secretSnapshotId)
      .lean()
      .populate<{ secretVersions: ISecretVersion[] }>("secretVersions")
      .populate<{ folderVersion: TFolderRootVersionSchema }>("folderVersion");

    if (!secretSnapshot) throw new Error("Failed to find secret snapshot");
  } catch (err) {
    Sentry.setUser({ email: req.user.email });
    Sentry.captureException(err);
    return res.status(400).send({
      message: "Failed to get secret snapshot",
    });
  }
  const folderId = secretSnapshot.folderId;
  // to show only the folder required secrets
  secretSnapshot.secretVersions = secretSnapshot.secretVersions.filter(
    ({ folder }) => folder === folderId
  );

  secretSnapshot.folderVersion =
    secretSnapshot?.folderVersion?.nodes?.children?.map(({ id, name }) => ({
      id,
      name,
    })) as any;

  return res.status(200).send({
    secretSnapshot,
  });
};
