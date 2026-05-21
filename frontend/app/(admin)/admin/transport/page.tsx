import { redirect } from "next/navigation";

const TransportIndexPage = (): never => {
  redirect("/admin/transport/buses");
};

export default TransportIndexPage;
