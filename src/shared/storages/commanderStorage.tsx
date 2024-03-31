import { BaseStorage, createStorage, StorageType } from "../storages/base";

type Commanders = Array<string>;

type CommanderStorage = BaseStorage<Commanders>;

const storage = createStorage<Commanders>(
  "commander-storage-key",
  ["commander"],
  {
    storageType: StorageType.Local,
    liveUpdate: true,
  }
);

const commanderStorage: CommanderStorage = {
  ...storage,
};

export default commanderStorage;
