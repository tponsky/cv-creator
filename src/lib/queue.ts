import { Queue } from 'bullmq';
import { redis } from './redis';

export const CV_QUEUE_NAME = 'cv-processing';

export const cvQueue = new Queue(CV_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: {
            age: 3600, // Keep completed jobs for 1 hour
            count: 1000, // Or keep the last 1000 jobs
        },
        removeOnFail: {
            age: 24 * 3600, // Keep failed jobs for 24 hours
        },
    },
});

export interface CVJobData {
    userId: string;
    text: string;
    originalFileName?: string;
}
