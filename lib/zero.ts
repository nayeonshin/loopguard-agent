import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const zeroBinary = process.env.ZERO_RUNNER || 'zero';

interface ZeroCapability {
  token: string;
  slug: string;
  brandName: string;
  name: string;
  url: string;
  method: string;
  [key: string]: any;
}

interface ZeroFetchResponse {
  runId: string;
  ok: boolean;
  status: number;
  payment: { amount: string } | null;
  body: unknown;
}

export async function zeroSearch(query: string, limit = 3): Promise<ZeroCapability[]> {
  const { stdout } = await execFileAsync(zeroBinary, ['search', query, '--json', '--limit', String(limit)], { maxBuffer: 20 * 1024 * 1024 });
  const result = JSON.parse(stdout) as { capabilities: ZeroCapability[] };
  return result.capabilities;
}

export async function zeroFetchCapability(token: string, body: unknown, maxPay: string): Promise<ZeroFetchResponse> {
  const { stdout } = await execFileAsync(zeroBinary, ['fetch', '--capability', token, '--json', '--max-pay', maxPay, '--timeout', '120', '-d', JSON.stringify(body)], { maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(stdout) as ZeroFetchResponse;
}

export interface ZeroAttempt {
  provider: string;
  capability: string;
  runId?: string;
  paidUsd: number;
  ok: boolean;
  error?: string;
}

export async function zeroCall(searchQuery: string, body: unknown, opts: { limit?: number; maxPay?: string; skipFirst?: boolean } = {}): Promise<{ ok: boolean; body: unknown; attempts: ZeroAttempt[] }> {
  const { limit = 3, maxPay = process.env.LOOPGUARD_ZERO_MAX_PAY || '0.05', skipFirst = false } = opts;
  const capabilities = await zeroSearch(searchQuery, limit);

  const attempts: ZeroAttempt[] = [];

  let firstAttempt: ZeroAttempt | undefined;

  if (skipFirst && capabilities.length > 0) {
    const firstCapability = capabilities[0];
    firstAttempt = {
      provider: firstCapability.brandName || firstCapability.slug,
      capability: firstCapability.slug,
      paidUsd: 0,
      ok: false,
      error: 'Skipped'
    };
    attempts.push(firstAttempt);
    capabilities.shift();
  }

  for (const capability of capabilities) {
    try {
      const response = await zeroFetchCapability(capability.token, body, maxPay);
      const attempt: ZeroAttempt = {
        provider: capability.brandName || capability.slug,
        capability: capability.slug,
        runId: response.runId,
        paidUsd: parseFloat(response.payment?.amount || '0'),
        ok: response.ok
      };
      attempts.push(attempt);
      if (response.ok) {
        return { ok: true, body: response.body, attempts };
      }
    } catch (error) {
      const attempt: ZeroAttempt = {
        provider: capability.brandName || capability.slug,
        capability: capability.slug,
        paidUsd: 0,
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      attempts.push(attempt);
    }
  }

  return { ok: false, body: {}, attempts };
}

export async function zeroLLM(messages: { role: string; content: string }[], maxTokens = 16384): Promise<string> {
  const result = await zeroCall('qwen llm inference', { messages, max_tokens: maxTokens }, { limit: 2 });
  const body = result.body as { content?: string; choices?: { message?: { content?: string } }[] };
  return body.content ?? body.choices?.[0]?.message?.content ?? '';
}
