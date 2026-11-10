import { TAttributeOwner, TIdentityAttributeDataAccess } from "../data-access/identity-attribute-data-access";
import { IdentityAttribute } from "../model/identity-attribute";
import { InMemoryAccessControlState } from "./in-memory-access-control-state";

export class InMemoryIdentityAttributeDataAccess implements TIdentityAttributeDataAccess {
  constructor(private readonly state: InMemoryAccessControlState) {}

  async replace(owner: TAttributeOwner, attributes: { key: string; value: string }[]): Promise<IdentityAttribute[]> {
    const { attributes: table } = this.state.tables;
    const owns = (row: { userId?: string | null; identityId?: string | null; orgId: string }) =>
      row.orgId === owner.orgId &&
      ("userId" in owner ? row.userId === owner.userId : row.identityId === owner.identityId);
    for (const [id, row] of table) {
      if (owns(row)) table.delete(id);
    }
    const now = new Date();
    return attributes.map((attribute) => {
      const id = InMemoryAccessControlState.newId();
      table.set(id, {
        id,
        ...attribute,
        orgId: owner.orgId,
        userId: "userId" in owner ? owner.userId : null,
        identityId: "identityId" in owner ? owner.identityId : null,
        createdAt: now,
        updatedAt: now
      });
      return IdentityAttribute.restore({ id, ...attribute });
    });
  }
}
