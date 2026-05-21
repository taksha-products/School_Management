import { redirect } from "next/navigation";

export default function LegacyStudentsRedirect(): null {
  redirect("/admin/students");
}
