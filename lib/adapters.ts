import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addEvent, getRuntimeStore } from './store';
import type { ActionName, PolicyContext, PolicyResult, ToolResult } from './types';
import { evaluatePolicy } from './policy';
import { zeroCall } from './zero';

function saveEvidence(base64: string): string {
  const dir = join(process.cwd(), 'public', 'evidence');
  mkdirSync(dir, { recursive: true });
  const name = `zero-${Date.now()}.png`;
  writeFileSync(join(dir, name), Buffer.from(base64, 'base64'));
  return `/evidence/${name}`;
}

export async function authorizeWithPomerium(
  action: ActionName,
  context: PolicyContext
): Promise<PolicyResult> {
  const realEndpoint = process.env.POMERIUM_AUTHORIZE_URL;

  if (realEndpoint) {
    try {
      const response = await fetch(realEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.POMERIUM_TOKEN
            ? { authorization: `Pomerium ${process.env.POMERIUM_TOKEN}` }
            : {})
        },
        body: JSON.stringify({ action, context })
      });

      if (response.ok) {
        const result = (await response.json()) as PolicyResult;
        addEvent(
          'policy',
          result.decision === 'ALLOWED' ? 'success' : 'error',
          `Pomerium ${result.decision}: ${action}`,
          result.reason,
          { provider: 'pomerium', action }
        );
        return result;
      }
    } catch (error) {
      addEvent(
        'policy',
        'warning',
        'Pomerium adapter fell back to local policy',
        error instanceof Error ? error.message : 'Unknown Pomerium error',
        { action }
      );
    }
  }

  const localDecision = evaluatePolicy(action, context);
  addEvent(
    'policy',
    localDecision.decision === 'ALLOWED' ? 'success' : 'error',
    `Pomerium demo ${localDecision.decision}: ${action}`,
    localDecision.reason,
    { provider: 'local-pomerium-adapter', action }
  );
  return localDecision;
}

export async function executeZeroTool(action: ActionName): Promise<ToolResult> {
  const realEndpoint = process.env.ZERO_TOOL_URL;

  if (realEndpoint) {
    try {
      const response = await fetch(realEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.ZERO_API_KEY
            ? { authorization: `Bearer ${process.env.ZERO_API_KEY}` }
            : {})
        },
        body: JSON.stringify({ action })
      });

      if (response.ok) {
        const result = (await response.json()) as ToolResult;
        addEvent(
          'tool',
          result.ok ? 'success' : 'warning',
          `Zero tool ${result.ok ? 'succeeded' : 'failed'}`,
          result.detail,
          { provider: result.provider, action }
        );
        return result;
      }
    } catch (error) {
      addEvent(
        'tool',
        'warning',
        'Zero adapter fell back to local tools',
        error instanceof Error ? error.message : 'Unknown Zero error',
        { action }
      );
    }
  }

  const store = getRuntimeStore();

  if (process.env.LOOPGUARD_ZERO_LIVE === 'true') {
    if (action === 'capture_screenshot') {
      try {
        const result = await zeroCall('web page screenshot capture url', { url: process.env.LOOPGUARD_PROBE_URL || 'http://localhost:3000', format: 'png' }, { limit: 5, skipFirst: process.env.LOOPGUARD_ZERO_FORCE_FALLBACK === 'true' });
        const body = result.body as { url?: string; imageUrl?: string; screenshotUrl?: string; image?: string; data?: string };
        let artifactUrl = body.url ?? body.imageUrl ?? body.screenshotUrl ?? body.image;
        if (!artifactUrl && result.ok && typeof body.data === 'string') {
          artifactUrl = saveEvidence(body.data);
        }
        for (const attempt of result.attempts) {
          addEvent(
            'tool',
            attempt.ok ? 'success' : 'warning',
            attempt.ok ? 'Zero tool succeeded: ' + attempt.provider : 'Zero capability failed: ' + attempt.provider,
            `${action} - ${attempt.provider}`,
            { action, provider: attempt.provider, capability: attempt.capability, runId: attempt.runId, paidUsd: attempt.paidUsd, artifactUrl }
          );
        }
        if (result.ok) {
          return { action, ok: true, provider: result.attempts.find(a => a.ok)?.provider || 'zero-demo', detail: 'Screenshot captured successfully', artifactUrl };
        }
      } catch (error) {
        addEvent(
          'tool',
          'error',
          'Zero tool failed',
          error instanceof Error ? error.message : 'Unknown error',
          { action }
        );
      }
    } else if (action === 'notify_team') {
      try {
        const result = await zeroCall('send email', { to: [process.env.LOOPGUARD_ONCALL_EMAIL || 'cloud@sbat.org'], subject: '[Loopguard] incident escalation', text: 'Loopguard escalated an incident; action=' + action });
        for (const attempt of result.attempts) {
          addEvent(
            'tool',
            attempt.ok ? 'success' : 'warning',
            attempt.ok ? 'Zero tool succeeded: ' + attempt.provider : 'Zero capability failed: ' + attempt.provider,
            `${action} - ${attempt.provider}`,
            { action, provider: attempt.provider, capability: attempt.capability, runId: attempt.runId, paidUsd: attempt.paidUsd }
          );
        }
        if (result.ok) {
          return { action, ok: true, provider: result.attempts.find(a => a.ok)?.provider || 'zero-demo', detail: 'Email sent successfully' };
        }
      } catch (error) {
        addEvent(
          'tool',
          'error',
          'Zero tool failed',
          error instanceof Error ? error.message : 'Unknown error',
          { action }
        );
      }
    } else if (action === 'publish_status') {
      try {
        const result = await zeroCall('send email', { to: [process.env.LOOPGUARD_ONCALL_EMAIL || 'cloud@sbat.org'], subject: '[Loopguard] status update', text: 'Current status: healthy' });
        for (const attempt of result.attempts) {
          addEvent(
            'tool',
            attempt.ok ? 'success' : 'warning',
            attempt.ok ? 'Zero tool succeeded: ' + attempt.provider : 'Zero capability failed: ' + attempt.provider,
            `${action} - ${attempt.provider}`,
            { action, provider: attempt.provider, capability: attempt.capability, runId: attempt.runId, paidUsd: attempt.paidUsd }
          );
        }
        if (result.ok) {
          return { action, ok: true, provider: result.attempts.find(a => a.ok)?.provider || 'zero-demo', detail: 'Email sent successfully' };
        }
      } catch (error) {
        addEvent(
          'tool',
          'error',
          'Zero tool failed',
          error instanceof Error ? error.message : 'Unknown error',
          { action }
        );
      }
    }
  }

  if ((action === 'capture_screenshot' || action === 'publish_status') && !store.zeroPrimaryFailed) {
    store.zeroPrimaryFailed = true;
    addEvent(
      'tool',
      'warning',
      'Zero primary service failed',
      'The first discovered service timed out, so Loopguard will choose a fallback capability.',
      { provider: 'zero-primary-demo', action }
    );
    const fallback: ToolResult = {
      action,
      ok: true,
      provider: 'zero-fallback-demo',
      detail: 'Fallback service captured evidence successfully.',
      artifactUrl: '/evidence/checkout-regression.png'
    };
    addEvent('tool', 'success', 'Zero fallback service succeeded', fallback.detail, {
      provider: fallback.provider,
      action
    });
    return fallback;
  }

  const result: ToolResult = {
    action,
    ok: true,
    provider: 'zero-demo',
    detail: `${action} completed through the local Zero adapter.`
  };
  addEvent('tool', 'success', 'Zero tool succeeded', result.detail, {
    provider: result.provider,
    action
  });
  return result;
}
