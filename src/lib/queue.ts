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
        removeOnComplete: true,
    },
});

export interface CVJobData {
    userId: string;
    text: string;
    originalFileName?: string;
}
