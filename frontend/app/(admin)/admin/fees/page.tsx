import { redirect } from "next/navigation";

interface FeesPageProps {
  searchParams?: Promise<{
    studentId?: string;
    tab?: string;
  }>;
}

const FeesPage = async ({ searchParams }: FeesPageProps): Promise<never> => {
  const resolved = (await searchParams) ?? {};

  if (resolved.studentId) {
    if (resolved.tab === "transport") {
      redirect("/admin/fees/collect?tab=transport");
    }
    redirect(`/admin/fees/collect/${resolved.studentId}`);
  }
  if (resolved.tab === "transport") {
    redirect("/admin/fees/collect?tab=transport");
  }

  redirect("/admin/fees/outstanding");
};

export default FeesPage;
