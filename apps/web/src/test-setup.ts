import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/* Vitest runs without `globals`, so Testing Library's own auto-cleanup hook
   never registers and renders pile up across tests in a file. Unmount between
   them explicitly. */
afterEach(cleanup);
