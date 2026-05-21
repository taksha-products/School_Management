import { redirect } from "next/navigation";

export default function LegacyExpensesRedirect(): null {
  redirect("/admin/expenses");
}
