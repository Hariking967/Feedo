import { redirect } from "next/navigation";

export default function PostRedirectPage() {
  redirect("/dashboard/donor");
}
