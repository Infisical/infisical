import { NotFoundError } from "@app/lib/errors";

import { TObservabilityWidgetViewDALFactory } from "./observability-widget-view-dal";

export type TObservabilityWidgetViewServiceFactory = ReturnType<typeof observabilityWidgetViewServiceFactory>;

type TObservabilityWidgetViewServiceFactoryDep = {
  observabilityWidgetViewDAL: TObservabilityWidgetViewDALFactory;
};

export const observabilityWidgetViewServiceFactory = ({
  observabilityWidgetViewDAL
}: TObservabilityWidgetViewServiceFactoryDep) => {
  const createView = async (dto: { name: string; orgId: string; userId: string }) => {
    const view = await observabilityWidgetViewDAL.create({
      name: dto.name,
      orgId: dto.orgId,
      userId: dto.userId,
      items: JSON.stringify([])
    });
    return view;
  };

  const listViews = async (orgId: string, userId: string) => {
    return observabilityWidgetViewDAL.findByOrgAndUser(orgId, userId);
  };

  const getView = async (viewId: string) => {
    const view = await observabilityWidgetViewDAL.findById(viewId);
    if (!view) {
      throw new NotFoundError({ message: "Widget view not found" });
    }
    return view;
  };

  const updateView = async (viewId: string, dto: { name?: string; items?: unknown }) => {
    const existing = await observabilityWidgetViewDAL.findById(viewId);
    if (!existing) {
      throw new NotFoundError({ message: "Widget view not found" });
    }
    const updated = await observabilityWidgetViewDAL.updateById(viewId, {
      name: dto.name,
      items: dto.items !== undefined ? JSON.stringify(dto.items) : undefined
    });
    return updated;
  };

  const deleteView = async (viewId: string) => {
    const view = await observabilityWidgetViewDAL.findById(viewId);
    if (!view) {
      throw new NotFoundError({ message: "Widget view not found" });
    }
    await observabilityWidgetViewDAL.deleteById(viewId);
    return view;
  };

  return {
    createView,
    listViews,
    getView,
    updateView,
    deleteView
  };
};
