import { redirect } from "next/navigation";

interface FeesPageProps {
  searchParams?: {
    studentId?: string;
    tab?: string;
  };
}

const FeesPage = ({ searchParams }: FeesPageProps): never => {
  if (searchParams?.studentId) {
    if (searchParams.tab === "transport") {
      redirect("/admin/fees/collect?tab=transport");
    }
    redirect(`/admin/fees/collect/${searchParams.studentId}`);
  }
  if (searchParams?.tab === "transport") {
    redirect("/admin/fees/collect?tab=transport");
  }

  redirect("/admin/fees/outstanding");
};

export default FeesPage;
