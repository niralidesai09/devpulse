// The decision log now lives on the Pain Points page.
import { redirect } from "next/navigation";
export default function DecisionsPage() {
  redirect("/pain-points#decisions");
}
