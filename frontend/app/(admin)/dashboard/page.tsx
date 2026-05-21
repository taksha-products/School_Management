import { redirect } from "next/navigation";

export default function LegacyDashboardRedirect(): null {
  redirect("/admin/dashboard");
}
