import { redirect } from "next/navigation";

interface FeesPageProps {
  searchParams?: {
    studentId?: string;
    tab?: string;
  };
}

const FeesPage = ({ searchParams }: FeesPageProps): never => {
  const params = new URLSearchParams();

  if (searchParams?.studentId) {
    params.set("studentId", searchParams.studentId);
  }
  if (searchParams?.tab === "transport") {
    params.set("tab", "transport");
  }

  if (params.size > 0) {
    redirect(`/admin/fees/collect?${params.toString()}`);
  }

  redirect("/admin/fees/outstanding");
};

export default FeesPage;
