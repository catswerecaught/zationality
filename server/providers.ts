import './config.js';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Evidence } from '../shared/types.js';
import { plainText, safeUrl } from './domain.js';

export class ServiceError extends Error {
  constructor(message: string, public code = 'UPSTREAM_ERROR', public status = 502) { super(message); }
}
export function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>(resolve => waiting.push(resolve));
    active++;
    try { return await task(); }
    finally { active--; waiting.shift()?.(); }
  };
}
const cliLimit = limiter(2);
export const cliPath = process.env.ZHIHU_CLI_PATH || (process.platform === 'darwin'
  ? path.join(homedir(), 'Library/Application Support/zhihu-cli/current/zhihu-cli')
  : path.join(process.env.XDG_DATA_HOME || path.join(homedir(), '.local/share'), 'zhihu-cli/current/zhihu-cli'));
export async function zhihu(args: string[], signal?: AbortSignal): Promise<any> {
  return cliLimit(() => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new ServiceError('分析已取消', 'CANCELLED', 499)); return; }
    execFile(cliPath, [...args, '--timeout', '45s'], { timeout: 50000, maxBuffer: 8 * 1024 * 1024, signal }, (error, stdout) => {
      let json: any;
      try { json = JSON.parse(stdout); } catch { /* Report a controlled message, never process arguments. */ }
      if (error || json?.ok === false || (json?.Code !== undefined && json.Code !== 0)) {
        const code = String(json?.error?.code ?? json?.Code ?? (error?.name === 'AbortError' ? 'CANCELLED' : 'ZHIHU_UNAVAILABLE'));
        reject(new ServiceError(code === '30001' || code === '30002' ? '知乎接口限流或额度不足，请稍后再试。' : json?.error?.message ?? json?.Message ?? '知乎服务暂不可用，请检查网络及 CLI 凭证。', code));
      } else resolve(json);
    });
  }));
}
export async function globalSearch(claim: string, prefix: string, signal: AbortSignal): Promise<Evidence[]> {
  const response = await zhihu(['search', 'global', '--query', claim, '--count', '3'], signal);
  return (response.Data?.Items ?? []).flatMap((item: any, index: number) => {
    const url = safeUrl(item.Url);
    if (!url) return [];
    if (new URL(url).hostname === 'zhihu.com' || new URL(url).hostname.endsWith('.zhihu.com')) return [];
    return [{ id: `${prefix}-g${index + 1}`, title: plainText(item.Title), url,
      snippet: plainText(item.ContentText).slice(0, 3500),
      published_at: Number(item.EditTime) > 0 ? new Date(Number(item.EditTime) * 1000).toISOString() : null,
      provider: 'zhihu_global' as const }];
  });
}
const modelLimit = limiter(3);
export const modelName = () => process.env.DEEPSEEK_MODEL || 'deepseek-flash';
export async function deepseek(system: string, input: unknown, opts: { json?: boolean; signal: AbortSignal }) {
  if (!process.env.DEEPSEEK_API_KEY) throw new ServiceError('请先在本地服务端配置 DeepSeek API Key。', 'DEEPSEEK_NOT_CONFIGURED', 503);
  return modelLimit(async () => {
    opts.signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetch(`${(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', signal: AbortSignal.any([opts.signal, AbortSignal.timeout(150000)]),
        headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName(), thinking: { type: 'disabled' }, max_tokens: 5000,
          messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }],
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } catch {
      throw new ServiceError(opts.signal.aborted ? '分析已取消' : 'DeepSeek 连接失败或超时，请检查网络。', opts.signal.aborted ? 'CANCELLED' : 'DEEPSEEK_NETWORK');
    }
    let data: any;
    try { data = await response.json(); } catch { throw new ServiceError('DeepSeek 返回了无效响应。', 'DEEPSEEK_PROTOCOL'); }
    if (!response.ok || data.error) {
      const status = response.status;
      throw new ServiceError(status === 401 ? 'DeepSeek API Key 无效。' : status === 402 ? 'DeepSeek 余额不足。' : status === 429 ? 'DeepSeek 请求受限，请稍后再试。' : `DeepSeek 请求失败（${status}），请检查模型与服务状态。`, `DEEPSEEK_${status}`);
    }
    if (data.choices?.[0]?.finish_reason !== 'stop') throw new ServiceError('DeepSeek 未完整输出本次诊断，未采用截断结果。', 'INCOMPLETE_DIAGNOSIS');
    const message = data.choices?.[0]?.message;
    if (typeof message?.content !== 'string' || !message.content.trim()) throw new ServiceError('DeepSeek 未返回有效诊断。', 'EMPTY_DIAGNOSIS');
    return message;
  });
}
export function parseModelJson(content: string): unknown {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); }
  catch { throw new ServiceError('模型输出不符合 JSON 协议，已排除该条诊断。', 'INVALID_DIAGNOSIS'); }
}
