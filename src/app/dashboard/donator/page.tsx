import { redirect } from "next/navigation";

export default async function DonatorDashboardPage() {
  redirect("/dashboard/donor");
}
