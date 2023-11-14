import { IServerConfig, ServerConfig } from "../models/serverConfig";

let serverConfig: IServerConfig;

export const serverConfigInit = async () => {
  const cfg = await ServerConfig.findOne({});
  if (!cfg) {
    const cfg = new ServerConfig();
    await cfg.save();
    serverConfig = cfg;
  } else {
    serverConfig = cfg;
  }
  return serverConfig;
};

export const getServerConfig = () => serverConfig;

export const updateServerConfig = async (data: Partial<IServerConfig>) => {
  const cfg = await ServerConfig.findByIdAndUpdate(serverConfig._id, data, { new: true });
  if (!cfg) throw new Error("Failed to update server config");
  serverConfig = cfg;
  return serverConfig;
};
