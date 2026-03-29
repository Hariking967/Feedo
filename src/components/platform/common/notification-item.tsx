import Link from "next/link";
import type { NotificationModel } from "@/lib/platform/types";

export function NotificationItem({ item }: { item: NotificationModel }) {
  return (
    <Link href={item.relatedPath} className={`block rounded-lg border p-3 ${item.read ? "border-slate-200 bg-white" : "border-blue-200 bg-blue-50"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
          <p className="mt-1 text-sm text-slate-600">{item.message}</p>
        </div>
        <span className="text-xs text-slate-500">{item.createdAt}</span>
      </div>
    </Link>
  );
}
