import { redirect } from "next/navigation";

export default async function ConsumerDashboardPage() {
  redirect("/dashboard/donor");
}
