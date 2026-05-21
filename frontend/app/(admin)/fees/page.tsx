import { redirect } from "next/navigation";

export default function LegacyFeesRedirect(): null {
  redirect("/admin/fees");
}
