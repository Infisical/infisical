import { Request, Response } from "express";
import { Types } from "mongoose";
import crypto from "crypto";
import bcrypt from "bcrypt";
import {
    ServiceAccount,
    ServiceAccountKey,
    ServiceAccountOrganizationPermission,
    ServiceAccountWorkspacePermission,
} from "../../models";
import {
    CreateServiceAccountDto,
} from "../../interfaces/serviceAccounts/dto";
import { BadRequestError, ServiceAccountNotFoundError } from "../../utils/errors";
import { getSaltRounds } from "../../config";

/**
 * Return service account tied to the request (service account) client
 * @param req
 * @param res
 */
export const getCurrentServiceAccount = async (req: Request, res: Response) => {
    const serviceAccount = await ServiceAccount.findById(req.serviceAccount._id);

    if (!serviceAccount) {
        throw ServiceAccountNotFoundError({ message: "Failed to find service account" });
    }

    return res.status(200).send({
        serviceAccount,
    });
}

/**
 * Return service account with id [serviceAccountId]
 * @param req 
 * @param res 
 */
export const getServiceAccountById = async (req: Request, res: Response) => {
    const { serviceAccountId } = req.params;

    const serviceAccount = await ServiceAccount.findById(serviceAccountId);

    if (!serviceAccount) {
        throw ServiceAccountNotFoundError({ message: "Failed to find service account" });
    }

    return res.status(200).send({
        serviceAccount,
    });
}

/**
 * Create a new service account under organization with id [organizationId]
 * that has access to workspaces [workspaces]
 * @param req 
 * @param res 
 * @returns
 */
export const createServiceAccount = async (req: Request, res: Response) => {
    const {
        name,
        organizationId,
        publicKey,
        expiresIn,
    }: CreateServiceAccountDto = req.body;

    let expiresAt;
    if (expiresIn) {
        expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
    }

    const secret = crypto.randomBytes(16).toString("base64");
    const secretHash = await bcrypt.hash(secret, await getSaltRounds());

    // create service account
    const serviceAccount = await new ServiceAccount({
        name,
        organization: new Types.ObjectId(organizationId),
        user: req.user,
        publicKey,
        lastUsed: new Date(),
        expiresAt,
        secretHash,
    }).save()

    const serviceAccountObj = serviceAccount.toObject();

    delete (serviceAccountObj as any).secretHash;

    // provision default org-level permission for service account
    await new ServiceAccountOrganizationPermission({
        serviceAccount: serviceAccount._id,
    }).save();

    const secretId = Buffer.from(serviceAccount._id.toString(), "hex").toString("base64");

    return res.status(200).send({
        serviceAccountAccessKey: `sa.${secretId}.${secret}`,
        serviceAccount: serviceAccountObj,
    });
}

/**
 * Change name of service account with id [serviceAccountId] to [name]
 * @param req 
 * @param res 
 * @returns 
 */
export const changeServiceAccountName = async (req: Request, res: Response) => {
    const { serviceAccountId } = req.params;
    const { name } = req.body;

    const serviceAccount = await ServiceAccount.findOneAndUpdate(
        {
            _id: new Types.ObjectId(serviceAccountId),
        },
        {
            name,
        },
        {
            new: true,
        }
    );

    return res.status(200).send({
        serviceAccount,
    });
}

/**
 * Add a service account key to service account with id [serviceAccountId]
 * for workspace with id [workspaceId]
 * @param req 
 * @param res 
 * @returns 
 */
export const addServiceAccountKey = async (req: Request, res: Response) => {
    const {
        workspaceId,
        encryptedKey,
        nonce,
    } = req.body;

    const serviceAccountKey = await new ServiceAccountKey({
        encryptedKey,
        nonce,
        sender: req.user._id,
        serviceAccount: req.serviceAccount._d,
        workspace: new Types.ObjectId(workspaceId),
    }).save();

    return serviceAccountKey;
}

/**
 * Return workspace-level permission for service account with id [serviceAccountId]
 * @param req 
 * @param res 
 */
export const getServiceAccountWorkspacePermissions = async (req: Request, res: Response) => {
    const serviceAccountWorkspacePermissions = await ServiceAccountWorkspacePermission.find({
        serviceAccount: req.serviceAccount._id,
    }).populate("workspace");

    return res.status(200).send({
        serviceAccountWorkspacePermissions,
    });
}

/**
 * Add a workspace permission to service account with id [serviceAccountId]
 * @param req 
 * @param res 
 */
export const addServiceAccountWorkspacePermission = async (req: Request, res: Response) => {
    const { serviceAccountId } = req.params;
    const {
        environment,
        workspaceId,
        read = false,
        write = false,
        encryptedKey,
        nonce,
    } = req.body;

    if (!req.membership.workspace.environments.some((e: { name: string; slug: string }) => e.slug === environment)) {
        return res.status(400).send({
            message: "Failed to validate workspace environment",
        });
    }

    const existingPermission = await ServiceAccountWorkspacePermission.findOne({
        serviceAccount: new Types.ObjectId(serviceAccountId),
        workspace: new Types.ObjectId(workspaceId),
        environment,
    });

    if (existingPermission) throw BadRequestError({ message: "Failed to add workspace permission to service account due to already-existing " });

    const serviceAccountWorkspacePermission = await new ServiceAccountWorkspacePermission({
        serviceAccount: new Types.ObjectId(serviceAccountId),
        workspace: new Types.ObjectId(workspaceId),
        environment,
        read,
        write,
    }).save();

    const existingServiceAccountKey = await ServiceAccountKey.findOne({
        serviceAccount: new Types.ObjectId(serviceAccountId),
        workspace: new Types.ObjectId(workspaceId),
    });

    if (!existingServiceAccountKey) {
        await new ServiceAccountKey({
            encryptedKey,
            nonce,
            sender: req.user._id,
            serviceAccount: new Types.ObjectId(serviceAccountId),
            workspace: new Types.ObjectId(workspaceId),
        }).save();
    }

    return res.status(200).send({
        serviceAccountWorkspacePermission,
    });
}

/**
 * Delete workspace permission from service account with id [serviceAccountId]
 * @param req 
 * @param res 
 */
export const deleteServiceAccountWorkspacePermission = async (req: Request, res: Response) => {
    const { serviceAccountWorkspacePermissionId } = req.params;
    const serviceAccountWorkspacePermission = await ServiceAccountWorkspacePermission.findByIdAndDelete(serviceAccountWorkspacePermissionId);

    if (serviceAccountWorkspacePermission) {
        const { serviceAccount, workspace } = serviceAccountWorkspacePermission;
        const count = await ServiceAccountWorkspacePermission.countDocuments({
            serviceAccount,
            workspace,
        });

        if (count === 0) {
            await ServiceAccountKey.findOneAndDelete({
                serviceAccount,
                workspace,
            });
        }
    }

    return res.status(200).send({
        serviceAccountWorkspacePermission,
    });
}

/**
 * Delete service account with id [serviceAccountId]
 * @param req 
 * @param res 
 * @returns 
 */
export const deleteServiceAccount = async (req: Request, res: Response) => {
    const { serviceAccountId } = req.params;

    const serviceAccount = await ServiceAccount.findByIdAndDelete(serviceAccountId);

    if (serviceAccount) {
        await ServiceAccountKey.deleteMany({
            serviceAccount: serviceAccount._id,
        });

        await ServiceAccountOrganizationPermission.deleteMany({
            serviceAccount: new Types.ObjectId(serviceAccountId),
        });

        await ServiceAccountWorkspacePermission.deleteMany({
            serviceAccount: new Types.ObjectId(serviceAccountId),
        });
    }

    return res.status(200).send({
        serviceAccount,
    });
}

/**
 * Return service account keys for service account with id [serviceAccountId]
 * @param req 
 * @param res 
 * @returns 
 */
export const getServiceAccountKeys = async (req: Request, res: Response) => {
    const workspaceId = req.query.workspaceId as string;

    const serviceAccountKeys = await ServiceAccountKey.find({
        serviceAccount: req.serviceAccount._id,
        ...(workspaceId ? { workspace: new Types.ObjectId(workspaceId) } : {}),
    });

    return res.status(200).send({
        serviceAccountKeys,
    });
}