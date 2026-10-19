/**
 * series() のワーカー。lib.mts から受け取ったジョブ（デッキ2つ・シード・先攻・オプション）を
 * このスレッドで playGame() し、結果を返す。直接は実行しない
 */
import { parentPort } from 'node:worker_threads';
import { runJob, type WorkerJob } from './lib.mts';

if (!parentPort) throw new Error('worker.mts はワーカーとしてだけ動く');

parentPort.on('message', (job: WorkerJob) => {
  try {
    parentPort!.postMessage({ results: runJob(job) });
  } catch (e) {
    parentPort!.postMessage({ error: (e as Error).stack ?? String(e) });
  }
});
