import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deepseek, modelName } from '../server/providers.js';
import { cacheKey, PIPELINE_VERSION } from '../server/pipeline.js';
import { querySchema } from '../server/domain.js';

test('DeepSeek 拆解与评分请求不携带联网工具，即使传入旧的 web 标记', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.DEEPSEEK_API_KEY;
  const requests: any[] = [];
  process.env.DEEPSEEK_API_KEY = 'test-only-key';
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(String(options?.body)));
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"result":"ok"}' } }] }), { status: 200 });
  };
  try {
    const legacyOptions = { web: true, json: true, signal: new AbortController().signal };
    await deepseek('只输出 JSON', { excerpt: '测试片段' }, legacyOptions);
    assert.equal(requests.length, 1);
    assert.equal('tools' in requests[0], false);
    assert.equal('tool_choice' in requests[0], false);
    assert.equal('web_search_options' in requests[0], false);
    assert.deepEqual(requests[0].response_format, { type: 'json_object' });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test('知乎单一搜索策略不复用旧的 DeepSeek 联网分析缓存', () => {
  const input = querySchema.parse({ query: '测试问题', count: 5, use_cache: true });
  const oldKey = createHash('sha256').update(JSON.stringify(['1.0.2', modelName(), input.query, input.count, ''])).digest('hex').slice(0, 24);
  assert.equal(PIPELINE_VERSION, '1.1.0');
  assert.notEqual(cacheKey(input), oldKey);
});
