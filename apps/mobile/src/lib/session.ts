import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  ApiClientError,
  SessionApiClient,
  type CurrentUser,
  type CreateCountSubmissionRequest,
  type CreateStockEventRequest,
  type CreateStockProposalRequest,
  type LoginRequest,
  type RegisterRequest,
} from '@anbaro/contracts';

import {
  getCountQueueSnapshot,
  SQLiteCountQueueStore,
  syncPendingCountSubmissions,
  type CountQueueSnapshot,
} from './count-offline-queue';

const refreshTokenKey = 'stock_refresh_token';
const isWeb = Platform.OS === 'web';
const configuredApiBaseUrl =
  (globalThis as { process?: { env?: { EXPO_PUBLIC_API_BASE_URL?: string } } }).process?.env
    ?.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

/**
 * `localhost` only resolves to the development machine on web and the iOS
 * simulator. On Android emulators and physical devices it points at the
 * device itself, so rewrite it to the Metro dev-server host (the machine
 * running `expo start`), which every device in a dev session can reach.
 */
function resolveApiBaseUrl(): string {
  if (isWeb || !/^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(configuredApiBaseUrl)) {
    return configuredApiBaseUrl;
  }
  const hostUri = Constants.expoConfig?.hostUri;
  const devHost = hostUri?.split(':')[0];
  if (!devHost) return configuredApiBaseUrl;
  return configuredApiBaseUrl.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)/i, `$1${devHost}`);
}

const apiBaseUrl = resolveApiBaseUrl();

/** Access tokens intentionally live only in this process; only refresh values use SecureStore. */
export class MobileSessionController {
  private accessToken: string | null = null;
  private countQueue: Promise<SQLiteCountQueueStore> | null = null;
  private readonly api = new SessionApiClient({
    baseUrl: apiBaseUrl,
    clientType: isWeb ? 'web' : 'mobile',
    getAccessToken: () => this.accessToken,
    setAccessToken: (token) => {
      this.accessToken = token;
    },
    ...(!isWeb
      ? {
          getRefreshToken: () => SecureStore.getItemAsync(refreshTokenKey),
          setRefreshToken: (token: string | null) =>
            token
              ? SecureStore.setItemAsync(refreshTokenKey, token)
              : SecureStore.deleteItemAsync(refreshTokenKey),
        }
      : {}),
  });

  async bootstrap(): Promise<CurrentUser | null> {
    if (!isWeb) {
      const refreshToken = await SecureStore.getItemAsync(refreshTokenKey);
      if (!refreshToken) return null;
    }
    try {
      await this.api.refresh();
      const user = (await this.api.getCurrentUser()).data;
      if (user.activeOrganizationId) await this.syncOfflineCounts().catch(() => undefined);
      return user;
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) return null;
      throw error;
    }
  }

  async login(input: LoginRequest): Promise<CurrentUser> {
    await this.api.login(input);
    return (await this.api.getCurrentUser()).data;
  }

  async register(input: RegisterRequest): Promise<CurrentUser> {
    await this.api.register(input);
    return (await this.api.getCurrentUser()).data;
  }

  async logout(): Promise<void> {
    await this.api.logout();
  }

  /** Irreversible. Deletes the account and every workspace the user owns. */
  async deleteAccount(email: string, password: string): Promise<void> {
    await this.api.deleteAccount({ email, password });
  }

  async createOrganization(name: string): Promise<void> {
    await this.api.createOrganization({ name });
  }

  async selectOrganization(organizationId: string): Promise<void> {
    await this.api.selectActiveOrganization({ organizationId });
  }

  getLocations() {
    return this.api.getLocations();
  }

  createLocation(name: string, address: string) {
    return this.api.createLocation({ name, address: address || null });
  }

  updateLocation(id: string, name: string, address: string) {
    return this.api.updateLocation(id, { name, address: address || null });
  }

  archiveLocation(id: string) {
    return this.api.archiveLocation(id);
  }

  getBilling() {
    return this.api.getBilling();
  }

  getCategories() {
    return this.api.getCategories();
  }

  createCategory(name: string, broadTypeFallback: 'food' | 'cleaning' | 'equipment' | 'other') {
    return this.api.createCategory({ name, broadTypeFallback });
  }

  getItems(options: { categoryId?: string; locationId?: string; search?: string } = {}) {
    return this.api.getItems(options);
  }

  createItem(input: {
    categoryId: string;
    name: string;
    unit: string;
    packSize?: number | null;
    packUnit?: string | null;
    barcodeIdentifier?: string | null;
  }) {
    return this.api.createItem(input);
  }

  getItemByBarcode(barcode: string) {
    return this.api.getItemByBarcode(barcode);
  }

  archiveItem(id: string) {
    return this.api.archiveItem(id);
  }

  getStockEvents(itemId: string, locationId: string) {
    return this.api.getStockEvents(itemId, { locationId });
  }

  createStockEvent(input: CreateStockEventRequest) {
    return this.api.createStockEvent(input);
  }

  createStockProposal(input: CreateStockProposalRequest) {
    return this.api.createStockProposal(input);
  }

  getSuppliers() {
    return this.api.getSuppliers();
  }

  createSupplier(input: {
    name: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
  }) {
    return this.api.createSupplier(input);
  }

  getLossByReason(query: { locationId?: string; from?: string; to?: string } = {}) {
    return this.api.getLossByReason(query);
  }

  getMemberships() {
    return this.api.getMemberships();
  }

  getNotificationPreferences() {
    return this.api.getNotificationPreferences();
  }

  updateNotificationPreference(channel: 'in_app' | 'email' | 'push', enabled: boolean) {
    return this.api.updateNotificationPreference({ channel, enabled });
  }

  getNotifications(unreadOnly = false) {
    return this.api.getNotifications(unreadOnly);
  }

  markNotificationRead(id: string) {
    return this.api.markNotificationRead(id);
  }

  getReorderSuggestions(locationId?: string) {
    return this.api.getReorderSuggestions({
      ...(locationId ? { locationId } : {}),
      status: 'pending',
    });
  }

  reviewReorderSuggestion(id: string, action: 'reviewed_sent' | 'dismissed') {
    return this.api.reviewReorderSuggestion(id, action);
  }

  getCountSessions(locationId?: string) {
    return this.api.getCountSessions(locationId ? { locationId } : {});
  }

  startCountSession(locationId: string) {
    return this.api.startCountSession(locationId);
  }

  getCountSession(id: string) {
    return this.api.getCountSession(id);
  }

  acceptCountSubmission(sessionId: string, lineId: string, submissionId: string) {
    return this.api.acceptCountSubmission(sessionId, lineId, submissionId);
  }

  startCountRecount(sessionId: string, lineId: string) {
    return this.api.startCountRecount(sessionId, lineId);
  }

  finalizeCountSession(sessionId: string, idempotencyKey: string) {
    return this.api.finalizeCountSession(sessionId, { idempotencyKey });
  }

  async queueCountSubmission(
    sessionId: string,
    lineId: string,
    input: CreateCountSubmissionRequest,
  ): Promise<CountQueueSnapshot> {
    const queue = await this.getCountQueue();
    await queue.enqueue({ sessionId, lineId, ...input });
    return syncPendingCountSubmissions(queue, this.api);
  }

  async syncOfflineCounts(): Promise<CountQueueSnapshot> {
    return syncPendingCountSubmissions(await this.getCountQueue(), this.api);
  }

  async getOfflineCountQueue(): Promise<CountQueueSnapshot> {
    return getCountQueueSnapshot(await this.getCountQueue());
  }

  async acknowledgeOfflineCountConflict(id: string): Promise<CountQueueSnapshot> {
    const queue = await this.getCountQueue();
    await queue.acknowledgeConflict(id);
    return getCountQueueSnapshot(queue);
  }

  private getCountQueue(): Promise<SQLiteCountQueueStore> {
    this.countQueue ??= SQLiteCountQueueStore.open();
    return this.countQueue;
  }
}
