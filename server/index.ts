import './config.js';
import express from 'express';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { querySchema, safeUrl } from './domain.js';
import { cacheKey, runPipeline } from './pipeline.js';
import { cliPath, modelName, ServiceError, zhihu } from './providers.js';
import { clearReports, listReports, readReport, saveReport } from './cache.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const origin = req.headers.origin;
  const localPorts = new Set(['5173', process.env.PORT || '3001']);
  const validHost = (host: string) => { const [name, port] = host.split(':'); return ['127.0.0.1', 'localhost'].includes(name) && localPorts.has(port); };
  if (!validHost(req.headers.host || '') || (origin && (!origin.startsWith('http://') || !validHost(origin.slice(7))))) { res.status(403).json({ error: '仅允许本地应用访问' }); return; }
  next();
});
const wrap = (fn: express.RequestHandler): express.RequestHandler => (req, res, next) => { Promise.resolve(fn(req, res, next)).catch(next); };
app.get('/api/health', wrap(async (_req, res) => {
  const cli = await access(cliPath).then(() => true, () => false);
  res.json({ ok: true, deepseek_configured: !!process.env.DEEPSEEK_API_KEY, zhihu_cli_installed: cli, model: modelName(), web_search_enabled: true, web_search_provider: 'zhihu_global', deepseek_web_search_enabled: false });
}));
let hotCache: { at: number; items: any[] } | undefined;
app.get('/api/hot', wrap(async (_req, res) => {
  if (hotCache && Date.now() - hotCache.at < 300000) { res.json({ items: hotCache.items, fetched_at: new Date(hotCache.at).toISOString() }); return; }
  const data = await zhihu(['hot', '--limit', '8']);
  const items = (data.Data?.Items ?? []).filter((i: any) => safeUrl(i.Url, true)).map(({ Title, Url, Summary }: any) => ({ Title, Url, Summary }));
  hotCache = { at: Date.now(), items };
  res.json({ items, fetched_at: new Date().toISOString() });
}));
let quotaCache: { at: number; items: any[] } | undefined;
app.get('/api/quota', wrap(async (_req, res) => {
  if (quotaCache && Date.now() - quotaCache.at < 15000) { res.json({ items: quotaCache.items, fetched_at: new Date(quotaCache.at).toISOString() }); return; }
  const data = await zhihu(['quota', '--api-id', 'zhihu_search', '--api-id', 'global_search', '--api-id', 'hot_list']);
  quotaCache = { at: Date.now(), items: data.Data ?? [] };
  res.json({ items: quotaCache.items, fetched_at: new Date().toISOString() });
}));
app.get('/api/reports', wrap(async (_req, res) => { res.json({ items: await listReports() }); }));
app.delete('/api/reports', wrap(async (_req, res) => {
  if (activeRun) { res.status(409).json({ error: '分析进行中，完成后再清空记录。' }); return; }
  res.json({ deleted: await clearReports() });
}));
app.get('/api/reports/:id', wrap(async (req, res) => {
  const report = await readReport(req.params.id);
  if (!report) { res.status(404).json({ error: '未找到缓存报告' }); return; }
  res.json({ ...report, cache_hit: true });
}));
let activeRun = false;
app.post('/api/analyze', wrap(async (req, res) => {
  const parsed = querySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数无效' }); return; }
  const input = parsed.data;
  const cached = input.use_cache ? await readReport(cacheKey(input)) : null;
  if (!cached && activeRun) { res.status(409).json({ error: '已有分析进行中，请等待或取消后再试。' }); return; }
  if (!cached && !process.env.DEEPSEEK_API_KEY) { res.status(503).json({ error: 'DeepSeek API Key 尚未配置。' }); return; }
  res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (event: string, data: unknown) => { if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  if (cached) {
    send('progress', { phase: 'rank', message: '已载入历史真实诊断，不重新调用模型', percent: 100, completed: cached.audited_count, total: cached.recalled_count });
    send('result', { ...cached, cache_hit: true });
    res.end(); return;
  }
  activeRun = true;
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': keep-alive\n\n'); }, 10000);
  try {
    const report = await runPipeline(input, p => send('progress', p), controller.signal);
    // Cache is an explicit demonstration feature; only completed real runs are persisted.
    try { await saveReport(report); } catch { report.warnings.push('本次报告未能保存到演示缓存。'); }
    quotaCache = undefined;
    send('result', report);
  } catch (error) {
    if (!controller.signal.aborted) send('error', { message: error instanceof ServiceError ? error.message : '分析未能完成，请稍后重试。', code: error instanceof ServiceError ? error.code : 'INTERNAL_ERROR' });
  } finally { clearInterval(heartbeat); activeRun = false; res.end(); }
}));
if (process.argv.includes('--production')) {
  app.use(express.static(path.resolve('dist')));
  app.get('*', (_req, res) => { res.sendFile(path.resolve('dist/index.html')); });
}
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(error instanceof ServiceError ? error.status : 500).json({ error: error instanceof ServiceError ? error.message : '请求处理失败', code: error instanceof ServiceError ? error.code : 'INTERNAL_ERROR' });
});
const port = Number(process.env.PORT || 3001);
app.listen(port, '127.0.0.1', () => { console.log(`Zationality API ready at http://127.0.0.1:${port}`); });
