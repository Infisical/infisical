import { Request, Response } from "express";
import { Builder } from "builder-pattern";
import { Types } from "mongoose";
import to from "await-to-js";
import { MongoError } from "mongodb";
import { BadRequestError } from "../../utils/errors";
import IpAddress, { IIpAddress } from "../../models/ipAddress";

export const createWorkspaceIpAddress = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  const { ip } = req.body;
  const ipAddressToCreate = Builder<IIpAddress>()
    .ip(ip)
    .workspace(new Types.ObjectId(workspaceId))
    .user(new Types.ObjectId(req.user._id))
    .build();

  const [err, createIPAddress] = await to(IpAddress.create(ipAddressToCreate));
  if (err) {
    if ((err as MongoError).code === 11000) {
      throw BadRequestError({ message: "Ip must be unique in a workspace" });
    }
    throw err;
  }
  return res.status(201).json(createIPAddress);
};

export const deleteWorkSpaceIpAddress = async (req: Request, res: Response) => {
  const { ipId, workspaceId } = req.params;
  const ipAddressFromDB = await IpAddress.findOne({
    id: new Types.ObjectId(ipId),
    workspace: new Types.ObjectId(workspaceId),
  })
  if (!ipAddressFromDB) {
    throw BadRequestError({message: "id does not exist"});
  }
   await ipAddressFromDB.deleteOne();
  return res.json();
};

export const getWorkspaceIpAddress = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  const ips = await IpAddress.find({ workspace: new Types.ObjectId(workspaceId) }, ["ip"]);
  return res.json(ips);
};
