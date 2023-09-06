import { Request, Response } from "express";
import { isValidScope, validateMembership } from "../../helpers";
import { Folder, SecretImport, ServiceTokenData } from "../../models";
import { getAllImportedSecrets } from "../../services/SecretImportService";
import { getFolderWithPathFromId } from "../../services/FolderService";
import { BadRequestError, ResourceNotFoundError,UnauthorizedRequestError } from "../../utils/errors";
import { ADMIN, MEMBER } from "../../variables";
import { EEAuditLogService } from "../../ee/services";
import { EventType } from "../../ee/models";

export const createSecretImport = async (req: Request, res: Response) => {
  const { workspaceId, environment, folderId, secretImport } = req.body;

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
  }

  const importSecDoc = await SecretImport.findOne({
    workspace: workspaceId,
    environment,
    folderId
  });
  
  const importToSecretPath = folders?getFolderWithPathFromId(folders.nodes, folderId).folderPath:"/";

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
  const { id } = req.params;
  const { secretImports } = req.body;
  const importSecDoc = await SecretImport.findById(id);
  if (!importSecDoc) {
    throw BadRequestError({ message: "Import not found" });
  }

  if (!(req.authData.authPayload instanceof ServiceTokenData)) {
    await validateMembership({
      userId: req.user._id.toString(),
      workspaceId: importSecDoc.workspace,
      acceptedRoles: [ADMIN, MEMBER]
    });
  } else {
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

    const isValidScopeAccess = isValidScope(
      req.authData.authPayload,
      importSecDoc.environment,
      secretPath
    );
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  }

  const orderBefore = importSecDoc.imports;
  importSecDoc.imports = secretImports;
  
  await importSecDoc.save();
  
  const folders = await Folder.findOne({
    workspace: importSecDoc.workspace,
    environment: importSecDoc.environment,
  }).lean();
  
  if (!folders) throw ResourceNotFoundError({
    message: "Failed to find folder"
  });
  
  const importToSecretPath = folders?getFolderWithPathFromId(folders.nodes, importSecDoc.folderId).folderPath:"/";

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.UPDATE_SECRET_IMPORT,
      metadata: {
        importToEnvironment: importSecDoc.environment,
        importToSecretPath,
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
  const { id } = req.params;
  const { secretImportEnv, secretImportPath } = req.body;
  const importSecDoc = await SecretImport.findById(id);
  if (!importSecDoc) {
    throw BadRequestError({ message: "Import not found" });
  }

  if (!(req.authData.authPayload instanceof ServiceTokenData)) {
    await validateMembership({
      userId: req.user._id.toString(),
      workspaceId: importSecDoc.workspace,
      acceptedRoles: [ADMIN, MEMBER]
    });
  } else {
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

    const isValidScopeAccess = isValidScope(
      req.authData.authPayload,
      importSecDoc.environment,
      secretPath
    );
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  }
  importSecDoc.imports = importSecDoc.imports.filter(
    ({ environment, secretPath }) =>
      !(environment === secretImportEnv && secretPath === secretImportPath)
  );
  await importSecDoc.save();

  const folders = await Folder.findOne({
    workspace: importSecDoc.workspace,
    environment: importSecDoc.environment,
  }).lean();
  
  if (!folders) throw ResourceNotFoundError({
    message: "Failed to find folder"
  });
  
  const importToSecretPath = folders?getFolderWithPathFromId(folders.nodes, importSecDoc.folderId).folderPath:"/";

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
        importToSecretPath
      }
    },
    {
      workspaceId: importSecDoc.workspace
    }
  );

  return res.status(200).json({ message: "successfully delete secret import" });
};

export const getSecretImports = async (req: Request, res: Response) => {
  const { workspaceId, environment, folderId } = req.query;
  const importSecDoc = await SecretImport.findOne({
    workspace: workspaceId,
    environment,
    folderId
  });

  if (!importSecDoc) {
    return res.status(200).json({ secretImport: {} });
  }

  if (req.authData.authPayload instanceof ServiceTokenData) {
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

    const isValidScopeAccess = isValidScope(
      req.authData.authPayload,
      importSecDoc.environment,
      secretPath
    );
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  }

  return res.status(200).json({ secretImport: importSecDoc });
};

export const getAllSecretsFromImport = async (req: Request, res: Response) => {
  const { workspaceId, environment, folderId } = req.query as {
    workspaceId: string;
    environment: string;
    folderId: string;
  };
  const importSecDoc = await SecretImport.findOne({
    workspace: workspaceId,
    environment,
    folderId
  });

  if (!importSecDoc) {
    return res.status(200).json({ secrets: [] });
  }

  if (req.authData.authPayload instanceof ServiceTokenData) {
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

    const isValidScopeAccess = isValidScope(
      req.authData.authPayload,
      importSecDoc.environment,
      secretPath
    );
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
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
