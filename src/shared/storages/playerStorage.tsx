import { BaseStorage, createStorage, StorageType } from "../storages/base";

type Players = Array<string>;

type PlayerStorage = BaseStorage<Players>;

const storage = createStorage<Players>("player-storage-key", ["player"], {
  storageType: StorageType.Local,
  liveUpdate: true,
});

const playerStorage: PlayerStorage = {
  ...storage,
};

export default playerStorage;
