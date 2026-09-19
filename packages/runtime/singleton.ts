import { SQLiteActivityStore } from "../activity-store";
import { RuntimeEngine } from "./engine";
import { configuration } from "./config";

const globalRuntime = globalThis as typeof globalThis & { shieldRuntime?: Promise<RuntimeEngine> };
export function runtimeEngine() {
  if (!globalRuntime.shieldRuntime) {
    const config = configuration();
    globalRuntime.shieldRuntime = new RuntimeEngine(
      new SQLiteActivityStore(config.file),
      config.engine,
    ).init();
  }
  return globalRuntime.shieldRuntime;
}
