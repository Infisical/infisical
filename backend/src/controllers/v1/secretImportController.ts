import { Request, Response } from "express";
import { validateMembership } from "../../helpers";
import SecretImport from "../../models/secretImports";
import { getAllImportedSecrets } from "../../services/SecretImportService";
import { BadRequestError } from "../../utils/errors";
import { ADMIN, MEMBER } from "../../variables";
import { EEAuditLogService } from "../../ee/services";
import { EventType } from "../../ee/models";

export const createSecretImport = async (req: Request, res: Response) => {
  const { workspaceId, environment, folderId, secretImport } = req.body;
  const importSecDoc = await SecretImport.findOne({
    workspace: workspaceId,
    environment,
    folderId
  });

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
          environment,
          secretImportId: doc._id.toString(),
          folderId: doc.folderId.toString(),
          importEnvironment: secretImport.environment,
          importSecretPath: secretImport.secretPath
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
        environment,
        secretImportId: importSecDoc._id.toString(),
        folderId: importSecDoc.folderId.toString(),
        importEnvironment: secretImport.environment,
        importSecretPath: secretImport.secretPath
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

  await validateMembership({
    userId: req.user._id.toString(),
    workspaceId: importSecDoc.workspace,
    acceptedRoles: [ADMIN, MEMBER]
  });

  importSecDoc.imports = secretImports;
  await importSecDoc.save();
  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.UPDATE_SECRET_IMPORT,
      metadata: {
        environment: importSecDoc.environment,
        secretImportId: importSecDoc._id.toString(),
        folderId: importSecDoc.folderId.toString(),
        numberOfImports: secretImports.length
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

  await validateMembership({
    userId: req.user._id.toString(),
    workspaceId: importSecDoc.workspace,
    acceptedRoles: [ADMIN, MEMBER]
  });
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
        environment: importSecDoc.environment,
        secretImportId: importSecDoc._id.toString(),
        folderId: importSecDoc.folderId.toString(),
        importEnvironment: secretImportEnv,
        importSecretPath: secretImportPath
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
