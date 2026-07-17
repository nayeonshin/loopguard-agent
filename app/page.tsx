import { Dashboard } from "./components/Dashboard";
import { getSnapshot } from "@/lib/store";
import { readTargetState } from "@/lib/target";

export default async function Home() {
  await readTargetState();
  return <Dashboard initialSnapshot={getSnapshot()} />;
}
