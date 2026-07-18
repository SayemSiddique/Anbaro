/** Shared types generated from the implemented Session 03 OpenAPI surface. */
export type ApiSuccess<T> = { data: T };

export type ApiError = {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
};

export type ClientType = 'web' | 'mobile';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'disabled';
};

export type AuthSession = {
  accessToken: string;
  expiresIn: number;
  activeOrganizationId: string | null;
  /** Returned only to the mobile client and must be stored in Keychain/Keystore. */
  refreshToken?: string;
};

export type RegisterRequest = {
  email: string;
  password: string;
  name: string;
  clientType?: ClientType;
};

export type LoginRequest = Omit<RegisterRequest, 'name'>;
export type RefreshRequest = { refreshToken?: string };

export type AuthResponse = ApiSuccess<{ user: AuthUser; session: AuthSession }>;
export type RefreshResponse = ApiSuccess<{ session: AuthSession }>;

export type MembershipSummary = {
  organizationId: string;
  organizationName: string;
  organizationStatus: 'active' | 'pending_deletion';
  membershipId: string;
  grantSetName: string;
  permissions: string[];
};

export type CurrentUser = AuthUser & {
  activeOrganizationId: string | null;
  memberships: MembershipSummary[];
};
export type MeResponse = ApiSuccess<CurrentUser>;

export type SelectActiveOrganizationRequest = { organizationId: string };
export type SelectActiveOrganizationResponse = ApiSuccess<{
  activeOrganizationId: string;
  accessToken: string;
  expiresIn: number;
}>;

export type ActiveOrganization = {
  id: string;
  name: string;
  status: 'active' | 'pending_deletion';
};
export type ActiveOrganizationResponse = ApiSuccess<ActiveOrganization>;

export type CreateOrganizationRequest = { name: string };
export type CreateOrganizationResponse = ApiSuccess<
  ActiveOrganization & { accessToken: string; expiresIn: number }
>;
export type UpdateOrganizationRequest = { name: string };

export type Location = {
  id: string;
  name: string;
  address: string | null;
  status: 'active' | 'archived';
};
export type LocationListResponse = ApiSuccess<Location[]> & {
  meta: { nextCursor: null; used: number; capacity: number };
};
export type CreateLocationRequest = { name: string; address?: string | null };
export type UpdateLocationRequest = Partial<CreateLocationRequest>;

export type BillingOverview = {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired_readonly';
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  customerId: string | null;
  planName: string;
  priceDescription: string;
  locationAddonPriceDescription: string;
  locations: { used: number; capacity: number };
};
export type BillingPlan = {
  id: string;
  name: string;
  basePrice: number;
  currency: string;
  billingInterval: 'monthly' | 'quarterly' | 'annual';
  includedLocations: number;
  displayPrice: string;
  tagline: string;
  features: string[];
};
export type CapacityCheckoutRequest = { idempotencyKey: string; quantity?: number };
export type CheckoutSessionResponse = {
  checkoutUrl: string | null;
  status: 'awaiting_reconciliation' | 'completed';
  intentId?: string;
};

export type Category = {
  id: string;
  name: string;
  icon: string | null;
  broadTypeFallback: 'food' | 'cleaning' | 'equipment' | 'other';
  status: 'active' | 'archived';
};
export type CreateCategoryRequest = {
  name: string;
  icon?: string | null;
  broadTypeFallback: Category['broadTypeFallback'];
};
export type UpdateCategoryRequest = Partial<CreateCategoryRequest>;
export type CategoryListResponse = ApiSuccess<Category[]> & { meta: { nextCursor: null } };

export type StockCondition = 'in_stock' | 'low_stock' | 'out_of_stock';
export type Item = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  name: string;
  unit: string;
  packSize: string | null;
  packUnit: string | null;
  barcodeIdentifier: string | null;
  status: 'active' | 'archived';
};
export type LocationStock = {
  quantity: string;
  threshold: string;
  parLevel: string | null;
  lastEventId: string | null;
  lastUpdatedAt: string;
  stockCondition: StockCondition;
};
export type ItemWithStock = Item & {
  quantity: string | null;
  threshold: string | null;
  parLevel: string | null;
  lastEventId: string | null;
  lastUpdatedAt: string | null;
  stockCondition: StockCondition | null;
};
export type CreateItemRequest = {
  categoryId: string;
  name: string;
  unit: string;
  packSize?: number | null;
  packUnit?: string | null;
  barcodeIdentifier?: string | null;
};
export type UpdateItemRequest = Partial<CreateItemRequest>;
export type ItemListRequest = { categoryId?: string; locationId?: string; search?: string };
export type ItemListResponse = ApiSuccess<ItemWithStock[]> & { meta: { nextCursor: null } };
export type StockEvent = {
  id: string;
  itemId: string;
  locationId: string;
  eventType: 'initial' | 'purchase' | 'loss' | 'adjustment' | 'count_reconciliation';
  quantityDelta: string;
  resultingQuantity: string;
  reasonCode: string | null;
  source: 'manual' | 'barcode' | 'csv_import' | 'count_session' | 'system';
  actorUserId: string;
  actorName?: string;
  locationName?: string;
  createdAt: string;
};
export type CreateStockEventRequest = {
  itemId: string;
  locationId: string;
  eventType: 'adjustment' | 'loss';
  quantityDelta: number;
  reasonCode?: string;
};
export type StockEventHistoryResponse = ApiSuccess<StockEvent[]> & {
  meta: { nextCursor: null };
};

export type CountSessionStatus = 'in_progress' | 'finalized' | 'abandoned';
export type CountLineResolution = 'pending' | 'single_submission' | 'conflict' | 'accepted';
export type CountSubmission = {
  id: string;
  roundNumber: number;
  quantity: string;
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  clientCreatedAt: string | null;
  source: 'count_session';
  idempotencyKey: string;
};
export type CountSessionLine = {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  recordedQuantityBefore: string;
  currentRound: number;
  resolutionStatus: CountLineResolution;
  acceptedSubmissionId: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  submissions: CountSubmission[];
};
export type CountSessionSummary = {
  id: string;
  locationId: string;
  locationName: string;
  status: CountSessionStatus;
  startedBy: string;
  startedByName: string;
  startedAt: string;
  finalizedBy: string | null;
  finalizedAt: string | null;
  lineCount: number;
  pendingCount: number;
  conflictCount: number;
  acceptedCount: number;
};
export type CountSession = CountSessionSummary & { lines: CountSessionLine[] };
export type CountSessionResponse = ApiSuccess<CountSession>;
export type CountSessionListResponse = ApiSuccess<CountSessionSummary[]> & {
  meta: { nextCursor: null };
};
export type CreateCountSubmissionRequest = {
  roundNumber: number;
  quantity: number;
  idempotencyKey: string;
  clientCreatedAt: string;
};
export type FinalizeCountRequest = { idempotencyKey: string };

export type Supplier = {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  itemCount?: number;
};
export type CreateSupplierRequest = {
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
};
export type SupplierMapping = {
  id: string;
  itemId: string;
  supplierId: string;
  supplierName?: string;
  supplierSku: string | null;
  isPrimary: boolean;
};
export type CreateSupplierMappingRequest = {
  supplierId: string;
  supplierSku?: string | null;
  isPrimary?: boolean;
};
export type UpdateLocationStockLevelsRequest = {
  locationId: string;
  threshold: number;
  parLevel: number | null;
};
export type NotificationChannel = 'in_app' | 'email' | 'push';
export type NotificationPreference = { channel: NotificationChannel; enabled: boolean };
export type Notification = {
  id: string;
  type: 'low_stock';
  title: string;
  body: string;
  locationId: string;
  locationName: string;
  itemId: string;
  itemName: string;
  readAt: string | null;
  createdAt: string;
};
export type ReorderSuggestion = {
  id: string;
  locationId: string;
  locationName: string;
  itemId: string;
  itemName: string;
  unit: string;
  suggestedQuantity: string;
  basis: 'par_level';
  status: 'pending' | 'reviewed_sent' | 'dismissed';
  generatedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  primarySupplierName: string | null;
};

export type DashboardLocation = {
  id: string;
  name: string;
  lowStockCount: number;
  lastCountAt: string | null;
  openConflictCount: number;
};
export type DashboardLowStock = {
  locationId: string;
  locationName: string;
  itemId: string;
  itemName: string;
  quantity: string;
  threshold: string;
  parLevel: string | null;
};
export type DashboardReport = { locations: DashboardLocation[]; lowStock: DashboardLowStock[] };
export type LossByReason = { reasonCode: string; eventCount: number; quantityLost: string };
export type ActivityEvent = {
  id: string;
  type: 'stock_event' | 'administration';
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  locationName: string | null;
  subject: string;
  details: Record<string, unknown>;
  createdAt: string;
};
export type PermissionGrantSet = {
  id: string;
  name: string;
  scope: 'system' | 'organization';
  version: number;
  isMutable: boolean;
  permissions: string[];
};
export type CreatePermissionGrantSetRequest = { name: string; permissions: string[] };
export type TeamMembership = {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: 'active' | 'revoked';
  joinedAt: string | null;
  grantSetId: string;
  grantSetName: string;
  grantSetScope: 'system' | 'organization';
  grantSetIsMutable: boolean;
};
export type MembershipInvitation = {
  id: string;
  email: string;
  invitedName: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  createdAt: string;
  grantSetId: string;
  grantSetName: string;
};
export type CreateMembershipInvitationRequest = {
  email: string;
  name?: string | null;
  grantSetId: string;
};
export type AcceptInvitationRequest = {
  token: string;
  password: string;
  name: string;
  clientType?: ClientType;
};

export type ImportRow = {
  id: string;
  rowNumber: number;
  name: string | null;
  unit: string | null;
  category: string | null;
  barcodeIdentifier: string | null;
  location: string | null;
  quantityDelta: string | null;
  status: 'valid' | 'error' | 'created' | 'updated' | 'skipped';
  operation: 'create' | 'update' | null;
  errors: string[];
  warnings: string[];
};
export type ImportBatch = {
  id: string;
  filename: string | null;
  status: 'validating' | 'preview' | 'committed' | 'failed';
  summary: {
    rows: number;
    valid: number;
    errors: number;
    created: number;
    updated: number;
    skipped: number;
  };
  failureReason: string | null;
  createdAt: string;
  committedAt: string | null;
  rows: ImportRow[];
};
export type ImportInitRequest = { idempotencyKey: string; filename: string };
export type ImportInitResponse = ApiSuccess<{
  id: string;
  status: 'validating' | 'preview' | 'committed' | 'failed';
  uploadUrl: string | null;
  uploadToken?: string;
  expiresIn?: number;
}>;
export type ImportBatchResponse = ApiSuccess<ImportBatch>;

/**
 * The API stores quantities as numeric(_, 3) and rejects any value it could not
 * store exactly. Clients check the same rule before sending, and mobile checks
 * it before queueing offline, where a value the server will refuse would sit in
 * the outbox retrying forever.
 */
export const MAX_STOCK_QUANTITY = 99999999999.999;

export function fitsStockQuantity(value: number): boolean {
  return (
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_STOCK_QUANTITY &&
    Number(value.toFixed(3)) === value
  );
}

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export type SessionApiClientOptions = {
  baseUrl: string;
  clientType: ClientType;
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
  getRefreshToken?: () => Promise<string | null>;
  setRefreshToken?: (token: string | null) => Promise<void>;
  fetchImplementation?: typeof fetch;
};

/**
 * A client for only the Session 03 endpoints. Access tokens remain in memory.
 * Web requests rely on the HttpOnly refresh cookie; mobile callers provide a
 * Keychain/Keystore-backed refresh-token adapter.
 */
export class SessionApiClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: SessionApiClientOptions) {
    // Wrap rather than reference the global: calling a stored `fetch` as
    // `this.fetchImplementation(...)` rebinds `this` to the client, which
    // browsers reject with "Illegal invocation" (Node does not care).
    this.fetchImplementation =
      options.fetchImplementation ?? ((input, init) => fetch(input, init));
  }

  async register(input: RegisterRequest): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ ...input, clientType: this.options.clientType }),
    });
    await this.applySession(response.data.session);
    return response;
  }

  async login(input: LoginRequest): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ ...input, clientType: this.options.clientType }),
    });
    await this.applySession(response.data.session);
    return response;
  }

  async refresh(): Promise<RefreshResponse> {
    const refreshToken = await this.options.getRefreshToken?.();
    if (this.options.clientType === 'mobile' && !refreshToken) {
      throw new ApiClientError(401, 'AUTH_SESSION_INVALID', 'Your session has expired.');
    }
    try {
      const response = await this.request<RefreshResponse>('/auth/refresh', {
        method: 'POST',
        ...(refreshToken ? { body: JSON.stringify({ refreshToken }) } : {}),
      });
      await this.applySession(response.data.session);
      return response;
    } catch (error) {
      this.options.setAccessToken(null);
      await this.options.setRefreshToken?.(null);
      throw error;
    }
  }

  async logout(): Promise<void> {
    const refreshToken = await this.options.getRefreshToken?.();
    try {
      await this.request<void>('/auth/logout', {
        method: 'POST',
        ...(refreshToken ? { body: JSON.stringify({ refreshToken }) } : {}),
      });
    } finally {
      this.options.setAccessToken(null);
      await this.options.setRefreshToken?.(null);
    }
  }

  getCurrentUser(): Promise<MeResponse> {
    return this.request<MeResponse>('/me', { method: 'GET' }, true);
  }

  async selectActiveOrganization(
    input: SelectActiveOrganizationRequest,
  ): Promise<SelectActiveOrganizationResponse> {
    const response = await this.request<SelectActiveOrganizationResponse>(
      '/me/active-organization',
      { method: 'POST', body: JSON.stringify(input) },
      true,
    );
    this.options.setAccessToken(response.data.accessToken);
    return response;
  }

  getActiveOrganization(): Promise<ActiveOrganizationResponse> {
    return this.request<ActiveOrganizationResponse>(
      '/me/active-organization',
      { method: 'GET' },
      true,
    );
  }

  async createOrganization(input: CreateOrganizationRequest): Promise<CreateOrganizationResponse> {
    const response = await this.request<CreateOrganizationResponse>(
      '/organizations',
      { method: 'POST', body: JSON.stringify(input) },
      true,
    );
    this.options.setAccessToken(response.data.accessToken);
    return response;
  }

  updateActiveOrganization(input: UpdateOrganizationRequest): Promise<ActiveOrganizationResponse> {
    return this.request<ActiveOrganizationResponse>(
      '/me/active-organization',
      { method: 'PATCH', body: JSON.stringify(input) },
      true,
    );
  }

  getLocations(): Promise<LocationListResponse> {
    return this.request<LocationListResponse>('/locations', { method: 'GET' }, true);
  }

  createLocation(input: CreateLocationRequest): Promise<ApiSuccess<Location>> {
    return this.request<ApiSuccess<Location>>(
      '/locations',
      { method: 'POST', body: JSON.stringify(input) },
      true,
    );
  }

  updateLocation(id: string, input: UpdateLocationRequest): Promise<ApiSuccess<Location>> {
    return this.request<ApiSuccess<Location>>(
      `/locations/${id}`,
      { method: 'PATCH', body: JSON.stringify(input) },
      true,
    );
  }

  archiveLocation(id: string): Promise<void> {
    return this.request<void>(`/locations/${id}`, { method: 'DELETE' }, true);
  }

  getBilling(): Promise<ApiSuccess<BillingOverview>> {
    return this.request('/billing', { method: 'GET' }, true);
  }

  getBillingPlans(): Promise<ApiSuccess<BillingPlan[]>> {
    return this.request('/billing/plans', { method: 'GET' }, true);
  }

  createBillingCheckout(): Promise<ApiSuccess<CheckoutSessionResponse>> {
    return this.request('/billing/checkout', { method: 'POST' }, true);
  }

  createCapacityCheckout(
    input: CapacityCheckoutRequest,
  ): Promise<ApiSuccess<CheckoutSessionResponse>> {
    return this.request(
      '/billing/capacity-checkout',
      { method: 'POST', body: JSON.stringify(input) },
      true,
    );
  }

  createBillingPortal(returnUrl: string): Promise<ApiSuccess<{ portalUrl: string }>> {
    return this.request(
      '/billing/portal',
      { method: 'POST', body: JSON.stringify({ returnUrl }) },
      true,
    );
  }

  getCategories(): Promise<CategoryListResponse> {
    return this.request<CategoryListResponse>('/categories', { method: 'GET' }, true);
  }

  createCategory(input: CreateCategoryRequest): Promise<ApiSuccess<Category>> {
    return this.request<ApiSuccess<Category>>(
      '/categories',
      { method: 'POST', body: JSON.stringify(input) },
      true,
    );
  }

  updateCategory(id: string, input: UpdateCategoryRequest): Promise<ApiSuccess<Category>> {
    return this.request<ApiSuccess<Category>>(
      `/categories/${id}`,
      { method: 'PATCH', body: JSON.stringify(input) },
      true,
    );
  }

  archiveCategory(id: string): Promise<void> {
    return this.request<void>(`/categories/${id}`, { method: 'DELETE' }, true);
  }

  getItems(query: ItemListRequest = {}): Promise<ItemListResponse> {
    const params = new URLSearchParams();
    if (query.categoryId) params.set('categoryId', query.categoryId);
    if (query.locationId) params.set('locationId', query.locationId);
    if (query.search) params.set('search', query.search);
    const suffix = params.size ? `?${params}` : '';
    return this.request<ItemListResponse>(`/items${suffix}`, { method: 'GET' }, true);
  }

  getItem(id: string): Promise<ApiSuccess<ItemWithStock>> {
    return this.request<ApiSuccess<ItemWithStock>>(`/items/${id}`, { method: 'GET' }, true);
  }

  getItemByBarcode(barcode: string): Promise<ApiSuccess<ItemWithStock>> {
    return this.request<ApiSuccess<ItemWithStock>>(
      `/items/barcode/${encodeURIComponent(barcode)}`,
      { method: 'GET' },
      true,
    );
  }

  createItem(input: CreateItemRequest): Promise<ApiSuccess<ItemWithStock>> {
    return this.request<ApiSuccess<ItemWithStock>>(
      '/items',
      { method: 'POST', body: JSON.stringify(input) },
      true,
    );
  }

  updateItem(id: string, input: UpdateItemRequest): Promise<ApiSuccess<ItemWithStock>> {
    return this.request<ApiSuccess<ItemWithStock>>(
      `/items/${id}`,
      { method: 'PATCH', body: JSON.stringify(input) },
      true,
    );
  }

  archiveItem(id: string): Promise<void> {
    return this.request<void>(`/items/${id}`, { method: 'DELETE' }, true);
  }

  getItemLocationStock(id: string, locationId: string): Promise<ApiSuccess<ItemWithStock>> {
    return this.request<ApiSuccess<ItemWithStock>>(
      `/items/${id}/location-stock?locationId=${encodeURIComponent(locationId)}`,
      { method: 'GET' },
      true,
    );
  }

  getStockEvents(
    id: string,
    options: { locationId?: string; limit?: number } = {},
  ): Promise<StockEventHistoryResponse> {
    const params = new URLSearchParams();
    if (options.locationId) params.set('locationId', options.locationId);
    if (options.limit) params.set('limit', String(options.limit));
    const suffix = params.size ? `?${params}` : '';
    return this.request<StockEventHistoryResponse>(
      `/items/${id}/stock-events${suffix}`,
      { method: 'GET' },
      true,
    );
  }

  createStockEvent(input: CreateStockEventRequest): Promise<ApiSuccess<StockEvent>> {
    return this.request<ApiSuccess<StockEvent>>(
      '/stock-events',
      { method: 'POST', body: JSON.stringify(input) },
      true,
    );
  }

  getSuppliers(): Promise<ApiSuccess<Supplier[]> & { meta: { nextCursor: null } }> {
    return this.request('/suppliers', { method: 'GET' }, true);
  }

  createSupplier(input: CreateSupplierRequest): Promise<ApiSuccess<Supplier>> {
    return this.request('/suppliers', { method: 'POST', body: JSON.stringify(input) }, true);
  }

  updateSupplier(id: string, input: Partial<CreateSupplierRequest>): Promise<ApiSuccess<Supplier>> {
    return this.request(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, true);
  }

  deleteSupplier(id: string): Promise<void> {
    return this.request(`/suppliers/${id}`, { method: 'DELETE' }, true);
  }

  getItemSuppliers(
    itemId: string,
  ): Promise<ApiSuccess<SupplierMapping[]> & { meta: { nextCursor: null } }> {
    return this.request(`/items/${itemId}/suppliers`, { method: 'GET' }, true);
  }

  createItemSupplier(
    itemId: string,
    input: CreateSupplierMappingRequest,
  ): Promise<ApiSuccess<SupplierMapping>> {
    return this.request(
      `/items/${itemId}/suppliers`,
      { method: 'POST', body: JSON.stringify(input) },
      true,
    );
  }

  deleteItemSupplier(itemId: string, mappingId: string): Promise<void> {
    return this.request(`/items/${itemId}/suppliers/${mappingId}`, { method: 'DELETE' }, true);
  }

  updateLocationStockLevels(
    itemId: string,
    input: UpdateLocationStockLevelsRequest,
  ): Promise<ApiSuccess<LocationStock>> {
    return this.request(
      `/items/${itemId}/location-stock/levels`,
      { method: 'PUT', body: JSON.stringify(input) },
      true,
    );
  }

  getNotificationPreferences(): Promise<ApiSuccess<NotificationPreference[]>> {
    return this.request('/notification-preferences', { method: 'GET' }, true);
  }

  updateNotificationPreference(
    input: NotificationPreference,
  ): Promise<ApiSuccess<NotificationPreference>> {
    return this.request(
      '/notification-preferences',
      { method: 'PUT', body: JSON.stringify(input) },
      true,
    );
  }

  getNotifications(
    unreadOnly = false,
  ): Promise<ApiSuccess<Notification[]> & { meta: { nextCursor: null } }> {
    return this.request(`/notifications?unreadOnly=${unreadOnly}`, { method: 'GET' }, true);
  }

  markNotificationRead(id: string): Promise<ApiSuccess<{ id: string; readAt: string }>> {
    return this.request(`/notifications/${id}/read`, { method: 'POST' }, true);
  }

  getReorderSuggestions(
    query: { locationId?: string; status?: ReorderSuggestion['status'] } = {},
  ): Promise<ApiSuccess<ReorderSuggestion[]> & { meta: { nextCursor: null } }> {
    const params = new URLSearchParams();
    if (query.locationId) params.set('locationId', query.locationId);
    if (query.status) params.set('status', query.status);
    const suffix = params.size ? `?${params}` : '';
    return this.request(`/reorder-suggestions${suffix}`, { method: 'GET' }, true);
  }

  reviewReorderSuggestion(
    id: string,
    action: 'reviewed_sent' | 'dismissed',
  ): Promise<ApiSuccess<Pick<ReorderSuggestion, 'id' | 'status' | 'reviewedBy' | 'reviewedAt'>>> {
    return this.request(
      `/reorder-suggestions/${id}/review`,
      { method: 'POST', body: JSON.stringify({ action }) },
      true,
    );
  }

  getDashboard(locationId?: string): Promise<ApiSuccess<DashboardReport>> {
    const suffix = locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
    return this.request(`/reports/dashboard${suffix}`, { method: 'GET' }, true);
  }

  getLossByReason(
    query: { locationId?: string; from?: string; to?: string } = {},
  ): Promise<ApiSuccess<LossByReason[]>> {
    const params = new URLSearchParams();
    if (query.locationId) params.set('locationId', query.locationId);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    const suffix = params.size ? `?${params}` : '';
    return this.request(`/reports/loss-by-reason${suffix}`, { method: 'GET' }, true);
  }

  getActivity(
    query: { locationId?: string; from?: string; to?: string } = {},
  ): Promise<ApiSuccess<ActivityEvent[]> & { meta: { nextCursor: null } }> {
    const params = new URLSearchParams();
    if (query.locationId) params.set('locationId', query.locationId);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    const suffix = params.size ? `?${params}` : '';
    return this.request(`/reports/activity${suffix}`, { method: 'GET' }, true);
  }

  getMemberships(): Promise<ApiSuccess<TeamMembership[]> & { meta: { nextCursor: null } }> {
    return this.request('/memberships', { method: 'GET' }, true);
  }

  updateMembership(
    id: string,
    input: { grantSetId?: string; status?: 'active' | 'revoked' },
  ): Promise<ApiSuccess<Pick<TeamMembership, 'id' | 'userId' | 'status' | 'grantSetId'>>> {
    return this.request(
      `/memberships/${id}`,
      { method: 'PATCH', body: JSON.stringify(input) },
      true,
    );
  }

  getMembershipInvitations(): Promise<
    ApiSuccess<MembershipInvitation[]> & { meta: { nextCursor: null } }
  > {
    return this.request('/membership-invitations', { method: 'GET' }, true);
  }

  createMembershipInvitation(
    input: CreateMembershipInvitationRequest,
  ): Promise<ApiSuccess<MembershipInvitation & { acceptanceToken: string }>> {
    return this.request(
      '/membership-invitations',
      { method: 'POST', body: JSON.stringify(input) },
      true,
    );
  }

  getPermissionGrantSets(): Promise<ApiSuccess<PermissionGrantSet[]>> {
    return this.request('/permission-grant-sets', { method: 'GET' }, true);
  }

  createPermissionGrantSet(
    input: CreatePermissionGrantSetRequest,
  ): Promise<ApiSuccess<PermissionGrantSet>> {
    return this.request(
      '/permission-grant-sets',
      { method: 'POST', body: JSON.stringify(input) },
      true,
    );
  }

  updatePermissionGrantSet(
    id: string,
    input: CreatePermissionGrantSetRequest,
  ): Promise<ApiSuccess<PermissionGrantSet>> {
    return this.request(
      `/permission-grant-sets/${id}`,
      { method: 'PATCH', body: JSON.stringify(input) },
      true,
    );
  }

  deletePermissionGrantSet(id: string): Promise<void> {
    return this.request(`/permission-grant-sets/${id}`, { method: 'DELETE' }, true);
  }

  acceptInvitation(input: AcceptInvitationRequest): Promise<AuthResponse> {
    return this.request('/invitations/accept', { method: 'POST', body: JSON.stringify(input) });
  }

  getCountSessions(
    query: { locationId?: string; status?: CountSessionStatus } = {},
  ): Promise<CountSessionListResponse> {
    const params = new URLSearchParams();
    if (query.locationId) params.set('locationId', query.locationId);
    if (query.status) params.set('status', query.status);
    const suffix = params.size ? `?${params}` : '';
    return this.request<CountSessionListResponse>(
      `/count-sessions${suffix}`,
      { method: 'GET' },
      true,
    );
  }

  startCountSession(locationId: string): Promise<CountSessionResponse> {
    return this.request<CountSessionResponse>(
      '/count-sessions',
      { method: 'POST', body: JSON.stringify({ locationId }) },
      true,
    );
  }

  getCountSession(id: string): Promise<CountSessionResponse> {
    return this.request<CountSessionResponse>(`/count-sessions/${id}`, { method: 'GET' }, true);
  }

  submitCount(
    sessionId: string,
    lineId: string,
    input: CreateCountSubmissionRequest,
  ): Promise<CountSessionResponse> {
    return this.request<CountSessionResponse>(
      `/count-sessions/${sessionId}/lines/${lineId}/submissions`,
      { method: 'POST', body: JSON.stringify(input) },
      true,
    );
  }

  acceptCountSubmission(
    sessionId: string,
    lineId: string,
    submissionId: string,
  ): Promise<CountSessionResponse> {
    return this.request<CountSessionResponse>(
      `/count-sessions/${sessionId}/lines/${lineId}/accept`,
      { method: 'POST', body: JSON.stringify({ submissionId }) },
      true,
    );
  }

  startCountRecount(sessionId: string, lineId: string): Promise<CountSessionResponse> {
    return this.request<CountSessionResponse>(
      `/count-sessions/${sessionId}/lines/${lineId}/recount`,
      { method: 'POST' },
      true,
    );
  }

  finalizeCountSession(
    sessionId: string,
    input: FinalizeCountRequest,
  ): Promise<CountSessionResponse> {
    return this.request<CountSessionResponse>(
      `/count-sessions/${sessionId}/finalize`,
      { method: 'POST', body: JSON.stringify(input) },
      true,
    );
  }

  initializeImport(input: ImportInitRequest): Promise<ImportInitResponse> {
    return this.request<ImportInitResponse>(
      '/imports',
      { method: 'POST', body: JSON.stringify(input) },
      true,
    );
  }

  uploadImport(
    id: string,
    uploadToken: string,
    content: string,
  ): Promise<ApiSuccess<{ id: string; status: string }>> {
    return this.request<ApiSuccess<{ id: string; status: string }>>(
      `/imports/${id}/upload`,
      { method: 'PUT', body: JSON.stringify({ uploadToken, content }) },
      true,
    );
  }

  getImport(id: string): Promise<ImportBatchResponse> {
    return this.request<ImportBatchResponse>(`/imports/${id}`, { method: 'GET' }, true);
  }

  commitImport(id: string): Promise<ImportBatchResponse> {
    return this.request<ImportBatchResponse>(`/imports/${id}/commit`, { method: 'POST' }, true);
  }

  getImportTemplate(): Promise<string> {
    return this.requestText('/imports/template', { method: 'GET' }, true);
  }

  getImportErrorReport(id: string): Promise<string> {
    return this.requestText(`/imports/${id}/error-report`, { method: 'GET' }, true);
  }

  exportOrganization(): Promise<string> {
    return this.requestText('/exports/organization', { method: 'GET' }, true);
  }

  private async applySession(session: AuthSession): Promise<void> {
    this.options.setAccessToken(session.accessToken);
    if (this.options.clientType === 'mobile') {
      await this.options.setRefreshToken?.(session.refreshToken ?? null);
    }
  }

  private async request<T>(path: string, init: RequestInit, retryAfterRefresh = false): Promise<T> {
    const accessToken = this.options.getAccessToken();
    const response = await this.fetchImplementation(`${this.options.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });

    if (response.status === 401 && retryAfterRefresh) {
      try {
        await this.refresh();
      } catch (error) {
        this.options.setAccessToken(null);
        await this.options.setRefreshToken?.(null);
        throw error;
      }
      return this.request<T>(path, init, false);
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => undefined)) as ApiError | undefined;
      throw new ApiClientError(
        response.status,
        payload?.error.code ?? 'NETWORK_ERROR',
        payload?.error.message ?? 'The service could not complete this request.',
        payload?.error.details ?? {},
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private async requestText(
    path: string,
    init: RequestInit,
    retryAfterRefresh = false,
  ): Promise<string> {
    const accessToken = this.options.getAccessToken();
    const response = await this.fetchImplementation(`${this.options.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'text/csv',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    });
    if (response.status === 401 && retryAfterRefresh) {
      await this.refresh();
      return this.requestText(path, init, false);
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => undefined)) as ApiError | undefined;
      throw new ApiClientError(
        response.status,
        payload?.error.code ?? 'NETWORK_ERROR',
        payload?.error.message ?? 'The service could not complete this request.',
        payload?.error.details ?? {},
      );
    }
    return response.text();
  }
}
