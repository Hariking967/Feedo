"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { applyTaskStatus, consumeQueuedUpdates, queueTaskStatusUpdate } from "../lib/offline-queue";
import type { DeliveryStatus, VolunteerTask } from "../types/logistics";

const ESCALATION_MS = 90 * 1000;

async function sendStatus(
  taskId: string,
  status: DeliveryStatus,
  options?: { escalated?: boolean; proofImageUrl?: string },
) {
  await fetch("/api/logistics/task-update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ taskId, status, ...options }),
  });
}

export function useOfflineDeliverySync(initialTasks: VolunteerTask[]) {
  const [tasks, setTasks] = useState(initialTasks);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const syncQueued = useCallback(async () => {
    const queued = consumeQueuedUpdates();
    if (!queued.length) {
      setPendingSyncCount(0);
      return;
    }

    for (const item of queued) {
      await sendStatus(item.taskId, item.status, {
        escalated: item.escalated,
        proofImageUrl: item.proofImageUrl,
      });
    }

    setPendingSyncCount(0);
  }, []);

  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const onOnline = async () => {
      setIsOnline(true);
      await syncQueued();
    };

    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [syncQueued]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTasks((current) =>
        current.map((task) => {
          if (task.status !== "assigned" || !task.acceptedAt) return task;
          if (task.escalated) return task;
          if (Date.now() - task.acceptedAt < ESCALATION_MS) return task;
          return { ...task, escalated: true, updatedAt: Date.now() };
        }),
      );
    }, 10000);

    return () => window.clearInterval(interval);
  }, []);

  const updateTaskStatus = useCallback(
    async (
      taskId: string,
      status: DeliveryStatus,
      options?: { escalated?: boolean; proofImageUrl?: string },
    ) => {
      setTasks((current) => applyTaskStatus(current, taskId, status, options));

      if (!navigator.onLine) {
        queueTaskStatusUpdate(taskId, status, options);
        setPendingSyncCount((current) => current + 1);
        return;
      }

      await sendStatus(taskId, status, options);
    },
    [],
  );

  const progress = useMemo(() => {
    const delivered = tasks.filter((task) => task.status === "delivered").length;
    return { delivered, total: tasks.length };
  }, [tasks]);

  return {
    tasks,
    isOnline,
    pendingSyncCount,
    updateTaskStatus,
    progress,
  };
}
