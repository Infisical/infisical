import { CreateDynamicSecretFlow } from "./create-dynamic-secret-flow";
import { CreateFolderFlow } from "./create-folder-flow";
import { CreateHoneyTokenFlow } from "./create-honey-token-flow";
import { CreateImportFlow } from "./create-import-flow";
import { CreateProxiedServiceFlow } from "./create-proxied-service-flow";
import { CreateSecretFlow } from "./create-secret-flow";
import { CreateSecretRotationFlow } from "./create-secret-rotation-flow";
import type { AddFlowRegistry } from "./types";

export { FlowToasts } from "./shared";
export type { AddFlowProps, AddFlowRegistry, FlowFeedback, FlowScope, NewResource } from "./types";

export const addFlows: AddFlowRegistry = {
  secret: CreateSecretFlow,
  folder: CreateFolderFlow,
  dynamic: CreateDynamicSecretFlow,
  rotation: CreateSecretRotationFlow,
  import: CreateImportFlow,
  honey: CreateHoneyTokenFlow,
  proxy: CreateProxiedServiceFlow
};
