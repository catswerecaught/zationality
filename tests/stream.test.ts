import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamAnalysis } from '../src/api.js';

test('SSE 跨 UTF-8 字节与事件边界时仍能读取进度和最终结果', async () => {
  const previous = globalThis.fetch;
  const frame = 'event: progress\ndata: {"phase":"verify","message":"正在核查事实","percent":50,"completed":1,"total":4}\n\nevent: result\ndata: {"id":"real-report"}\n\n';
  const bytes = new TextEncoder().encode(frame);
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
  const events: string[] = [];
  try {
    await streamAnalysis({}, new AbortController().signal, p => events.push(p.message), r => events.push(r.id));
    assert.deepEqual(events, ['正在核查事实', 'real-report']);
  } finally { globalThis.fetch = previous; }
});
test('流中断不会被当作成功，服务端错误会显示真实提示', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('event: progress\ndata: {"percent":30}\n\n');
    await assert.rejects(streamAnalysis({}, new AbortController().signal, () => {}, () => {}), /连接中断/);
    globalThis.fetch = async () => new Response('event: error\ndata: {"message":"DeepSeek 余额不足"}\n\n');
    await assert.rejects(streamAnalysis({}, new AbortController().signal, () => {}, () => {}), /余额不足/);
  } finally { globalThis.fetch = previous; }
});
