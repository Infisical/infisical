import { InMemoryOutboxEntryStore } from "../testing/in-memory-outbox-entry-store";
import { describeOutboxEntryStoreContract } from "../testing/outbox-entry-store-contract";

describeOutboxEntryStoreContract("InMemoryOutboxEntryStore", async () => {
  const store = new InMemoryOutboxEntryStore();
  return {
    store,
    transaction: (work) => work(store),
    rows: async (consumer) => store.all(consumer),
    patch: async (id, values) => store.patch(id, values as Parameters<typeof store.patch>[1])
  };
});
