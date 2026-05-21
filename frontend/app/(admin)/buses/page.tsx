import { redirect } from "next/navigation";

export default function LegacyBusesRedirect(): null {
  redirect("/admin/buses");
}
