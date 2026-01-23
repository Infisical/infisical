import { TDbClient } from "@app/db";
import { TIncidentContacts } from "@app/db/schemas/incident-contacts";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";

export type TIncidentContactsDALFactory = ReturnType<typeof incidentContactDALFactory>;

export const incidentContactDALFactory = (db: TDbClient) => {
  const create = async (orgId: string, email: string) => {
    try {
      const [incidentContact] = await db(TableName.IncidentContact).insert({ orgId, email }).returning("*");
      return incidentContact;
    } catch (error) {
      throw new DatabaseError({ name: "Incident contact create", error });
    }
  };

  const findByOrgId = async (orgId: string) => {
    try {
      const incidentContacts = await db.replicaNode()(TableName.IncidentContact).where({ orgId });
      return incidentContacts;
    } catch (error) {
      throw new DatabaseError({ name: "Incident contact list", error });
    }
  };

  const findOne = async (orgId: string, data: Partial<TIncidentContacts>) => {
    try {
      const incidentContacts = await db
        .replicaNode()(TableName.IncidentContact)
        .where({ orgId, ...data })
        .first();
      return incidentContacts;
    } catch (error) {
      throw new DatabaseError({ name: "Incident contact find one", error });
    }
  };

  const deleteById = async (id: string, orgId: string) => {
    try {
      const [incidentContact] = await db(TableName.IncidentContact).where({ orgId, id }).delete().returning("*");
      return incidentContact;
    } catch (error) {
      throw new DatabaseError({ name: "Incident contact delete", error });
    }
  };

  return {
    findByOrgId,
    findOne,
    create,
    deleteById
  };
};
