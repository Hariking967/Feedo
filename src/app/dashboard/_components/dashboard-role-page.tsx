import { RoleDashboard, type DashboardRole } from "@/components/platform/dashboard/role-dashboard";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

interface DashboardRolePageProps {
  role: DashboardRole;
}

export default async function DashboardRolePage({ role }: DashboardRolePageProps) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/auth/sign-in");
  }

  return <RoleDashboard role={role} />;
}
