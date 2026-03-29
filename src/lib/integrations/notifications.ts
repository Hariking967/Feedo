import { getFcmToken } from "@/lib/integrations/firebase";

export async function registerPushToken(options?: {
  userId?: string;
  role?: "volunteer" | "receiver" | "ngo" | "recipient";
  location?: { lat: number; lng: number };
  active?: boolean;
}) {
  const token = await getFcmToken();
  if (!token) return false;

  await fetch("/api/notifications/register-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      userId: options?.userId,
      role: options?.role,
      location: options?.location,
      active: options?.active,
    }),
  });

  return true;
}
