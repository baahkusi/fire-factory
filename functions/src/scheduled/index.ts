/**
 * Scheduled jobs ship with the product, not the factory.
 * Export a Cloud Scheduler function from src/index.ts when the SPEC adds one.
 */
export interface ScheduledJob {
  name: string;
}

export const scheduledJobs: readonly ScheduledJob[] = [];
