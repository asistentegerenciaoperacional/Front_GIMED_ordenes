import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import type { Database } from "../shared/models";
import { makeSeed } from "../shared/seed";
import { validateDatabase } from "./integrity";
export class JsonStore {
  private state!: Database;
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(public file: string) {}
  static async open(file: string, seed: () => Database = makeSeed) {
    const store = new JsonStore(file);
    await mkdir(dirname(file), { recursive: true });
    try {
      store.state = validateDatabase(JSON.parse(await readFile(file, "utf8")));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      store.state = validateDatabase(seed());
      await store.persist(store.state);
    }
    return store;
  }
  snapshot(): Database {
    return structuredClone(this.state);
  }
  private async persist(state: Database) {
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(state, null, 2) + "\n", {
        encoding: "utf8",
        flag: "wx",
      });
      // Windows sync/indexing can hold a brief lock on the destination. Retry
      // the atomic rename, never delete or overwrite the previous file first.
      for (let attempt = 0; ; attempt++) {
        try {
          await rename(temp, this.file);
          break;
        } catch (error) {
          if (
            attempt >= 6 ||
            !["EPERM", "EACCES", "EBUSY"].includes(
              (error as NodeJS.ErrnoException).code ?? "",
            )
          )
            throw error;
          await pause(25 * 2 ** attempt);
        }
      }
    } finally {
      await rm(temp, { force: true }).catch(() => undefined);
    }
  }
  transaction<T>(operation: (next: Database) => Promise<T> | T): Promise<T> {
    const work = this.queue.then(async () => {
      const next = this.snapshot();
      const result = await operation(next);
      const checked = validateDatabase(next, this.state);
      await this.persist(checked);
      this.state = checked;
      return result;
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
}
