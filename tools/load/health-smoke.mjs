#!/usr/bin/env node

const target = new URL(process.env.LOAD_TEST_URL ?? 'http://127.0.0.1:3001/health');
const requests = Number.parseInt(process.env.LOAD_TEST_REQUESTS ?? '50', 10);
const concurrency = Number.parseInt(process.env.LOAD_TEST_CONCURRENCY ?? '5', 10);

if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname)) {
  throw new Error(
    'LOAD_TEST_URL must target localhost; external load testing requires explicit approval.',
  );
}
if (!Number.isSafeInteger(requests) || requests < 1 || requests > 5000) {
  throw new Error('LOAD_TEST_REQUESTS must be an integer from 1 to 5000.');
}
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 100) {
  throw new Error('LOAD_TEST_CONCURRENCY must be an integer from 1 to 100.');
}

const durations = [];
let nextRequest = 0;
let failures = 0;

async function requestOnce() {
  const startedAt = performance.now();
  try {
    const response = await fetch(target, { headers: { accept: 'application/json' } });
    if (!response.ok) failures += 1;
    await response.arrayBuffer();
  } catch {
    failures += 1;
  } finally {
    durations.push(performance.now() - startedAt);
  }
}

async function worker() {
  while (nextRequest < requests) {
    const next = nextRequest;
    nextRequest += 1;
    await requestOnce();
    // The reservation above prevents two workers from issuing the same request.
    if (next >= requests - 1) return;
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker));
durations.sort((a, b) => a - b);
const percentile = (p) => durations[Math.max(0, Math.ceil(durations.length * p) - 1)] ?? 0;
const summary = {
  target: target.toString(),
  requests,
  concurrency: Math.min(concurrency, requests),
  failures,
  failureRate: Number((failures / requests).toFixed(4)),
  p50Ms: Number(percentile(0.5).toFixed(1)),
  p95Ms: Number(percentile(0.95).toFixed(1)),
};
console.log(JSON.stringify(summary, null, 2));
if (failures > 0 || percentile(0.95) >= 500) process.exitCode = 1;
