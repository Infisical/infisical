import { Knex } from "knex";

import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TObservabilityWidgetViewDALFactory } from "./observability-widget-view-dal";

export type TObservabilityWidgetViewServiceFactory = ReturnType<typeof observabilityWidgetViewServiceFactory>;

type TObservabilityWidgetViewServiceFactoryDep = {
  observabilityWidgetViewDAL: TObservabilityWidgetViewDALFactory;
};

const DEFAULT_FAIL_ALERTS_LAYOUT = [
  { uid: "default-all-failures", tmpl: "all-failures", x: 0, y: 0, w: 6, h: 2 },
  { uid: "default-secret-syncs", tmpl: "secret-syncs", x: 6, y: 0, w: 6, h: 2 },
  { uid: "default-live-logs", tmpl: "logs", x: 0, y: 2, w: 12, h: 2 }
];

export const observabilityWidgetViewServiceFactory = ({
  observabilityWidgetViewDAL
}: TObservabilityWidgetViewServiceFactoryDep) => {
  const createView = async (dto: {
    name: string;
    orgId: string;
    userId?: string | null;
    scope?: "organization" | "private";
    items?: unknown;
  }) => {
    const view = await observabilityWidgetViewDAL.create({
      name: dto.name,
      orgId: dto.orgId,
      userId: dto.userId ?? null,
      scope: dto.scope ?? (dto.userId ? "private" : "organization"),
      items: dto.items !== undefined ? JSON.stringify(dto.items) : JSON.stringify([])
    });
    return view;
  };

  const createDefaultOrgView = async (orgId: string, tx?: Knex) => {
    const existingViews = await observabilityWidgetViewDAL.findOrgViews(orgId, tx);
    if (existingViews.length > 0) {
      return existingViews[0];
    }

    const view = await observabilityWidgetViewDAL.create(
      {
        name: "Fail alerts",
        orgId,
        userId: null,
        scope: "organization",
        isDefault: true,
        items: JSON.stringify(DEFAULT_FAIL_ALERTS_LAYOUT)
      },
      tx
    );
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
    if (view.isDefault) {
      throw new BadRequestError({ message: "Default views cannot be deleted" });
    }
    await observabilityWidgetViewDAL.deleteById(viewId);
    return view;
  };

  return {
    createView,
    createDefaultOrgView,
    listViews,
    getView,
    updateView,
    deleteView
  };
};
