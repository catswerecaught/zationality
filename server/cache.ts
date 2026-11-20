import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { HistoryItem, Report } from '../shared/types.js';
const root = path.resolve('data/reports');
export async function readReport(id: string): Promise<Report | null> {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  try { return JSON.parse(await readFile(path.join(root, `${id}.json`), 'utf8')); } catch { return null; }
}
export async function saveReport(report: Report) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const dest = path.join(root, `${report.id}.json`);
  const temp = `${dest}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(report), { mode: 0o600 });
  await rename(temp, dest);
}
export async function listReports(): Promise<HistoryItem[]> {
  try {
    const names = (await readdir(root)).filter(n => /^[a-f0-9]{24}\.json$/.test(n));
    const reports = await Promise.all(names.map(n => readReport(n.slice(0, -5))));
    return reports.filter((r): r is Report => !!r).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20)
      .map(({ id, query, created_at, requested_count, audited_count }) => ({ id, query, created_at, requested_count, audited_count }));
  } catch { return []; }
}
export async function clearReports(): Promise<number> {
  return clearReportsAt(root);
}
export async function clearReportsAt(directory: string): Promise<number> {
  let names: string[];
  try { names = (await readdir(directory)).filter(name => /^[a-f0-9]{24}\.json$/.test(name)); }
  catch { return 0; }
  const results = await Promise.allSettled(names.map(name => unlink(path.join(directory, name))));
  return results.filter(result => result.status === 'fulfilled').length;
}
