import type { Progress, Report } from '../shared/types';
export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败，请稍后重试');
  return data;
}
export async function streamAnalysis(input: unknown, signal: AbortSignal, onProgress: (p: Progress) => void, onReport: (r: Report) => void) {
  const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
  if (!response.ok) {
    const data = await response.json(); throw new Error(data.error || '分析请求失败');
  }
  if (!response.body) throw new Error('浏览器不支持流式响应');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let received = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const event = frame.split('\n').find(l => l.startsWith('event:'))?.slice(6).trim();
        const data = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
        if (!data) continue;
        const json = JSON.parse(data);
        if (event === 'error') throw new Error(json.message);
        if (event === 'progress') onProgress(json);
        if (event === 'result') { received = true; onReport(json); }
      }
      if (done) break;
    }
    if (!received) throw new Error('分析连接中断，尚未获得完整报告。');
  } finally { reader.releaseLock(); }
}
