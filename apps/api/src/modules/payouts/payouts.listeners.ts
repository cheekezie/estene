import { getQueue, startWorker } from '../../lib/queue';
import { PAYOUT_QUEUE, PayoutsService } from './payouts.service';

const SWEEP_QUEUE = 'payouts-sweep';

export function registerPayouts() {
  // Concurrency 1: transfers go out one at a time, which keeps gateway rate limits and audit order simple.
  startWorker(PAYOUT_QUEUE, (job) => PayoutsService.process(job.data.payoutId), 1);

  // Transfers the gateway reported as pending are re-checked until they settle.
  startWorker(SWEEP_QUEUE, () => PayoutsService.sweepProcessing(), 1);
  void getQueue(SWEEP_QUEUE).add(
    'sweep',
    {},
    { repeat: { every: 5 * 60_000 }, jobId: 'payouts-sweep' },
  );
}
