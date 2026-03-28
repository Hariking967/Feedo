import type { DeliveryStatus, VolunteerTask } from "../types/logistics";

const KEY = "feedo-offline-task-updates";

interface PendingTaskUpdate {
  taskId: string;
  status: DeliveryStatus;
  updatedAt: number;
  escalated?: boolean;
  proofImageUrl?: string;
}

function readQueue() {
  if (typeof window === "undefined") return [] as PendingTaskUpdate[];

  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingTaskUpdate[];
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingTaskUpdate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(queue));
}

export function queueTaskStatusUpdate(
  taskId: string,
  status: DeliveryStatus,
  options?: { escalated?: boolean; proofImageUrl?: string },
) {
  const queue = readQueue();
  queue.push({
    taskId,
    status,
    updatedAt: Date.now(),
    escalated: options?.escalated,
    proofImageUrl: options?.proofImageUrl,
  });
  writeQueue(queue);
}

export function consumeQueuedUpdates() {
  const queue = readQueue();
  writeQueue([]);
  return queue;
}

export function applyTaskStatus(
  tasks: VolunteerTask[],
  taskId: string,
  status: DeliveryStatus,
  options?: { escalated?: boolean; proofImageUrl?: string },
) {
  return tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          status,
          updatedAt: Date.now(),
          escalated: options?.escalated ?? task.escalated,
          acceptedAt: status === "assigned" ? Date.now() : task.acceptedAt,
          proofImageUrl: options?.proofImageUrl ?? task.proofImageUrl,
        }
      : task,
  );
}
