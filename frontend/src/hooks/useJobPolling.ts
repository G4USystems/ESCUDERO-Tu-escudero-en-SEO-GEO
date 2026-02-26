"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { geo, type JobStatus } from "@/lib/api";

export function useJobPolling(jobId: string | null, intervalMs = 3000) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const poll = useCallback(async () => {
    if (!jobId) return;
    try {
      const status = await geo.getJobStatus(jobId);
      setJob(status);
      if (status.status === "completed" || status.status === "failed") {
        clearInterval(timerRef.current);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Polling error");
      clearInterval(timerRef.current);
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    poll(); // immediate first call
    timerRef.current = setInterval(poll, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [jobId, intervalMs, poll]);

  return { job, error, isRunning: job?.status === "running" || job?.status === "pending" };
}
