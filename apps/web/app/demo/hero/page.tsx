import { Dashboard } from "../../../components/dashboard";
import { RuntimeEngine } from "@/packages/runtime/engine";
import { SQLiteActivityStore } from "@/packages/activity-store";
export const dynamic = "force-dynamic";
export default async function Hero() {
  const engine = await new RuntimeEngine(new SQLiteActivityStore(), { mode: "replay" }).init();
  try {
    await engine.start("demo-story", false);
    await engine.advance(25000);
    return <Dashboard hero initialState={engine.snapshot()} />;
  } finally {
    engine.dispose();
  }
}
