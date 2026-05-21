import { redirect } from "next/navigation";

export default function LegacyReportsRedirect(): null {
  redirect("/admin/reports");
}
