import { redirect } from "next/navigation";

export default async function OrganisationDashboardPage() {
  redirect("/dashboard/recipient");
}
