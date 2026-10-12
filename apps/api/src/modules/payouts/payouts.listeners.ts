import { startWorker } from '../../lib/queue';
import { PAYOUT_QUEUE, PayoutsService } from './payouts.service';

export function registerPayouts() {
  // Concurrency 1: transfers go out one at a time, which keeps gateway rate limits and audit order simple.
  startWorker(PAYOUT_QUEUE, (job) => PayoutsService.process(job.data.payoutId), 1);
}
