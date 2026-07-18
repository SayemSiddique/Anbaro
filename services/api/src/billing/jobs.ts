import { pool } from '../db/client.js';
import { BILLING_ENABLED } from './config.js';

/** Worker entry point: conversion never depends on a browser opening the app. */
export async function expireElapsedTrials(): Promise<number> {
  // Never strand a free-tier workspace in read-only; there is no way to pay out of it.
  if (!BILLING_ENABLED) return 0;
  if (!pool) throw new Error('DATABASE_URL is required for billing jobs');
  const result = await pool.query<{ expired_count: number }>(
    'SELECT app.expire_trials()::integer AS expired_count',
  );
  return result.rows[0]?.expired_count ?? 0;
}
