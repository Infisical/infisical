import { InMemoryKekHistoryStore } from "../testing/in-memory-kek-history-store";
import { describeKekHistoryStoreContract } from "../testing/kek-history-store-contract";

describeKekHistoryStoreContract("InMemoryKekHistoryStore", async () => ({ store: new InMemoryKekHistoryStore() }));
