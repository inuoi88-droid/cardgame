/**
 * draft.mts のワーカー。ドラフトのジョブ（draftlib.mts の DraftJob）の配列を受け取り、このスレッドで順に回して結果を返す。直接は実行しない
 */
import { parentPort } from 'node:worker_threads';
import { runDraftJob, type DraftJob } from './draftlib.mts';

if (!parentPort) throw new Error('draft-worker.mts はワーカーとしてだけ動く');

parentPort.on('message', (jobs: DraftJob[]) => {
  try {
    parentPort!.postMessage({ results: jobs.map(runDraftJob) });
  } catch (e) {
    parentPort!.postMessage({ error: (e as Error).stack ?? String(e) });
  }
});
