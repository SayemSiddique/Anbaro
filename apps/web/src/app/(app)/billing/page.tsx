import { redirect } from 'next/navigation';

/**
 * Anbaro is free, so there is no billing to manage and the API's billing routes
 * are not registered. `features/billing.tsx` is kept intact and unmodified for the
 * day paid plans return; restoring this page means reverting this file to render
 * <BillingFeature /> again. Until then anyone landing here is sent somewhere real.
 */
export default function BillingPage() {
  redirect('/support');
}
