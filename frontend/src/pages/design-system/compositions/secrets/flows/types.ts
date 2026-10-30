import type { ComponentType } from "react";

import type { Resource, ResourceKind } from "../../secrets-model";

type Distribute<T> = T extends Resource ? Omit<T, "id" | "createdAt" | "updatedAt"> : never;
export type NewResource = Distribute<Resource>;
export type EnvironmentOption = { value: string; label: string };

export type FlowScope = {
  project: string;
  path: string;
  environments: EnvironmentOption[];
  visibleEnvironments: EnvironmentOption[];
};

export type FlowFeedback = { title: string; description?: string };

export type AddFlowProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: FlowScope;
  resources: readonly Resource[];
  initial?: { environments?: string[]; name?: string };
  onCreate: (created: NewResource[], feedback: FlowFeedback) => void;
  onError: (feedback: FlowFeedback) => void;
  onNotice: (feedback: FlowFeedback) => void;
  onUploadSecrets?: () => void;
};

export type AddFlowRegistry = Partial<Record<ResourceKind, ComponentType<AddFlowProps>>>;
