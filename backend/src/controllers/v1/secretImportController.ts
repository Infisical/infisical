import { Request, Response } from "express";
import { isValidScope } from "@app/helpers";
import { Folder, SecretImport, ServiceTokenData } from "@app/models";
import { getAllImportedSecrets } from "@app/services/SecretImportService";
import { getFolderWithPathFromId } from "@app/services/FolderService";
import {
  BadRequestError,
  ResourceNotFoundError,
  UnauthorizedRequestError
} from "@app/utils/errors";
import { EEAuditLogService } from "@app/ee/services";
import { EventType } from "@app/ee/models";
import { validateRequest } from "@app/helpers/validation";
import * as reqValidator from "@app/validation/secretImports";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getUserProjectPermissions
} from "@app/ee/services/ProjectRoleService";
import { ForbiddenError, subject } from "@casl/ability";

export const createSecretImport = async (req: Request, res: Response) => {
  const {
    body: { workspaceId, environment, folderId, secretImport }
  } = await validateRequest(reqValidator.CreateSecretImportV1, req);

  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment
  }).lean();

  if (!folders && folderId !== "root") {
    throw ResourceNotFoundError({
      message: "Failed to find folder"
    });
  }

  let secretPath = "/";
  if (folders) {
    const { folderPath } = getFolderWithPathFromId(folders.nodes, folderId);
    secretPath = folderPath;
  }

  if (req.authData.authPayload instanceof ServiceTokenData) {
    // root check
    const isValidScopeAccess = isValidScope(req.authData.authPayload, environment, secretPath);
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  } else {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.SecretImports, { environment, secretPath })
    );
  }

  const importSecDoc = await SecretImport.findOne({
    workspace: workspaceId,
    environment,
    folderId
  });

  const importToSecretPath = folders
    ? getFolderWithPathFromId(folders.nodes, folderId).folderPath
    : "/";

  if (!importSecDoc) {
    const doc = new SecretImport({
      workspace: workspaceId,
      environment,
      folderId,
      imports: [{ environment: secretImport.environment, secretPath: secretImport.secretPath }]
    });

    await doc.save();
    await EEAuditLogService.createAuditLog(
      req.authData,
      {
        type: EventType.CREATE_SECRET_IMPORT,
        metadata: {
          secretImportId: doc._id.toString(),
          folderId: doc.folderId.toString(),
          importFromEnvironment: secretImport.environment,
          importFromSecretPath: secretImport.secretPath,
          importToEnvironment: environment,
          importToSecretPath
        }
      },
      {
        workspaceId: doc.workspace
      }
    );
    return res.status(200).json({ message: "successfully created secret import" });
  }

  const doesImportExist = importSecDoc.imports.find(
    (el) => el.environment === secretImport.environment && el.secretPath === secretImport.secretPath
  );
  if (doesImportExist) {
    throw BadRequestError({ message: "Secret import already exist" });
  }

  importSecDoc.imports.push({
    environment: secretImport.environment,
    secretPath: secretImport.secretPath
  });
  await importSecDoc.save();

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.CREATE_SECRET_IMPORT,
      metadata: {
        secretImportId: importSecDoc._id.toString(),
        folderId: importSecDoc.folderId.toString(),
        importFromEnvironment: secretImport.environment,
        importFromSecretPath: secretImport.secretPath,
        importToEnvironment: environment,
        importToSecretPath
      }
    },
    {
      workspaceId: importSecDoc.workspace
    }
  );
  return res.status(200).json({ message: "successfully created secret import" });
};

// to keep the ordering, you must pass all the imports in here not the only updated one
// this is because the order decide which import gets overriden
export const updateSecretImport = async (req: Request, res: Response) => {
  const {
    body: { secretImports },
    params: { id }
  } = await validateRequest(reqValidator.UpdateSecretImportV1, req);

  const importSecDoc = await SecretImport.findById(id);
  if (!importSecDoc) {
    throw BadRequestError({ message: "Import not found" });
  }

  // check for service token validity
  const folders = await Folder.findOne({
    workspace: importSecDoc.workspace,
    environment: importSecDoc.environment
  }).lean();

  let secretPath = "/";
  if (folders) {
    const { folderPath } = getFolderWithPathFromId(folders.nodes, importSecDoc.folderId);
    secretPath = folderPath;
  }

  if (req.authData.authPayload instanceof ServiceTokenData) {
    // token permission check
    const isValidScopeAccess = isValidScope(
      req.authData.authPayload,
      importSecDoc.environment,
      secretPath
    );
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  } else {
    // non token entry check
    const { permission } = await getUserProjectPermissions(
      req.user._id,
      importSecDoc.workspace.toString()
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.SecretImports, {
        environment: importSecDoc.environment,
        secretPath
      })
    );
  }

  const orderBefore = importSecDoc.imports;
  importSecDoc.imports = secretImports;

  await importSecDoc.save();

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.UPDATE_SECRET_IMPORT,
      metadata: {
        importToEnvironment: importSecDoc.environment,
        importToSecretPath: secretPath,
        secretImportId: importSecDoc._id.toString(),
        folderId: importSecDoc.folderId.toString(),
        orderBefore,
        orderAfter: secretImports
      }
    },
    {
      workspaceId: importSecDoc.workspace
    }
  );
  return res.status(200).json({ message: "successfully updated secret import" });
};

export const deleteSecretImport = async (req: Request, res: Response) => {
  const {
    params: { id },
    body: { secretImportEnv, secretImportPath }
  } = await validateRequest(reqValidator.DeleteSecretImportV1, req);

  const importSecDoc = await SecretImport.findById(id);
  if (!importSecDoc) {
    throw BadRequestError({ message: "Import not found" });
  }

  // check for service token validity
  const folders = await Folder.findOne({
    workspace: importSecDoc.workspace,
    environment: importSecDoc.environment
  }).lean();

  let secretPath = "/";
  if (folders) {
    const { folderPath } = getFolderWithPathFromId(folders.nodes, importSecDoc.folderId);
    secretPath = folderPath;
  }

  if (req.authData.authPayload instanceof ServiceTokenData) {
    const isValidScopeAccess = isValidScope(
      req.authData.authPayload,
      importSecDoc.environment,
      secretPath
    );
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  } else {
    const { permission } = await getUserProjectPermissions(
      req.user._id,
      importSecDoc.workspace.toString()
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.SecretImports, {
        environment: importSecDoc.environment,
        secretPath
      })
    );
  }
  importSecDoc.imports = importSecDoc.imports.filter(
    ({ environment, secretPath }) =>
      !(environment === secretImportEnv && secretPath === secretImportPath)
  );
  await importSecDoc.save();

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.DELETE_SECRET_IMPORT,
      metadata: {
        secretImportId: importSecDoc._id.toString(),
        folderId: importSecDoc.folderId.toString(),
        importFromEnvironment: secretImportEnv,
        importFromSecretPath: secretImportPath,
        importToEnvironment: importSecDoc.environment,
        importToSecretPath: secretPath
      }
    },
    {
      workspaceId: importSecDoc.workspace
    }
  );

  return res.status(200).json({ message: "successfully delete secret import" });
};

export const getSecretImports = async (req: Request, res: Response) => {
  const {
    query: { workspaceId, environment, folderId }
  } = await validateRequest(reqValidator.GetSecretImportsV1, req);
  const importSecDoc = await SecretImport.findOne({
    workspace: workspaceId,
    environment,
    folderId
  });

  if (!importSecDoc) {
    return res.status(200).json({ secretImport: {} });
  }

  // check for service token validity
  const folders = await Folder.findOne({
    workspace: importSecDoc.workspace,
    environment: importSecDoc.environment
  }).lean();

  let secretPath = "/";
  if (folders) {
    const { folderPath } = getFolderWithPathFromId(folders.nodes, importSecDoc.folderId);
    secretPath = folderPath;
  }

  if (req.authData.authPayload instanceof ServiceTokenData) {
    const isValidScopeAccess = isValidScope(
      req.authData.authPayload,
      importSecDoc.environment,
      secretPath
    );
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  } else {
    const { permission } = await getUserProjectPermissions(
      req.user._id,
      importSecDoc.workspace.toString()
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.SecretImports, {
        environment: importSecDoc.environment,
        secretPath
      })
    );
  }

  return res.status(200).json({ secretImport: importSecDoc });
};

export const getAllSecretsFromImport = async (req: Request, res: Response) => {
  const {
    query: { workspaceId, environment, folderId }
  } = await validateRequest(reqValidator.GetAllSecretsFromImportV1, req);

  const importSecDoc = await SecretImport.findOne({
    workspace: workspaceId,
    environment,
    folderId
  });

  if (!importSecDoc) {
    return res.status(200).json({ secrets: [] });
  }

  const folders = await Folder.findOne({
    workspace: importSecDoc.workspace,
    environment: importSecDoc.environment
  }).lean();

  let secretPath = "/";
  if (folders) {
    const { folderPath } = getFolderWithPathFromId(folders.nodes, importSecDoc.folderId);
    secretPath = folderPath;
  }

  if (req.authData.authPayload instanceof ServiceTokenData) {
    // check for service token validity
    const isValidScopeAccess = isValidScope(
      req.authData.authPayload,
      importSecDoc.environment,
      secretPath
    );
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  } else {
    const { permission } = await getUserProjectPermissions(
      req.user._id,
      importSecDoc.workspace.toString()
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.SecretImports, {
        environment: importSecDoc.environment,
        secretPath
      })
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, {
        environment: importSecDoc.environment,
        secretPath
      })
    );
  }

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.GET_SECRET_IMPORTS,
      metadata: {
        environment,
        secretImportId: importSecDoc._id.toString(),
        folderId,
        numberOfImports: importSecDoc.imports.length
      }
    },
    {
      workspaceId: importSecDoc.workspace
    }
  );

  const secrets = await getAllImportedSecrets(workspaceId, environment, folderId);
  return res.status(200).json({ secrets });
};
