// v1 URL kept working: topics now live under Settings.
import { redirect } from "next/navigation";
export default function TopicsPage() {
  redirect("/settings");
}
