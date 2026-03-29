import { pgTable, text, timestamp, boolean, integer, real } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').$defaultFn(() => false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
  updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date()).notNull()
	});

export const session = pgTable("session", {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(()=> user.id, { onDelete: 'cascade' })
	});

export const account = pgTable("account", {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(()=> user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
	});

export const verification = pgTable("verification", {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date())
	});

export const supplierPaymentProfile = pgTable("supplier_payment_profile", {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  qrImageUrl: text('qr_image_url').notNull(),
  createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
  updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
	});

export const donationEvent = pgTable("donation_event", {
  id: text("id").primaryKey(),
  supplierUserId: text("supplier_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  supplierName: text("supplier_name").notNull(),
  eventName: text("event_name").notNull(),
  totalQuantity: integer("total_quantity").notNull(),
  itemCount: integer("item_count").notNull(),
  pickupAddress: text("pickup_address"),
  pickupLat: real("pickup_lat").notNull(),
  pickupLng: real("pickup_lng").notNull(),
  safeWindowMinutes: integer("safe_window_minutes").notNull(),
  allocationStrategy: text("allocation_strategy").notNull(),
  allocationSummary: text("allocation_summary"),
  status: text("status").notNull().$defaultFn(() => "active"),
  assignedVolunteerId: text("assigned_volunteer_id"),
  expectedResponseMinutes: integer("expected_response_minutes"),
  createdAt: timestamp("created_at").$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
  updatedAt: timestamp("updated_at").$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
});

export const foodListing = pgTable("food_listing", {
  id: text("id").primaryKey(),
  supplierUserId: text("supplier_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  bulkEventId: text("bulk_event_id").references(() => donationEvent.id, { onDelete: "set null" }),
  supplierName: text("supplier_name").notNull(),
  foodName: text("food_name").notNull(),
  quantity: integer("quantity").notNull(),
  foodCategory: text("food_category").notNull(),
  cookedAt: timestamp("cooked_at").notNull(),
  packagingCondition: text("packaging_condition").notNull(),
  storageCondition: text("storage_condition").notNull(),
  pickupAddress: text("pickup_address"),
  pickupLat: real("pickup_lat").notNull(),
  pickupLng: real("pickup_lng").notNull(),
  deliveryLat: real("delivery_lat"),
  deliveryLng: real("delivery_lng"),
  price: integer("price").notNull(),
  routeDurationMinutes: integer("route_duration_minutes").notNull(),
  routeDistanceKm: real("route_distance_km").notNull(),
  weatherTempC: real("weather_temp_c").notNull(),
  weatherHumidityPct: integer("weather_humidity_pct").notNull(),
  spoilageScore: real("spoilage_score").notNull(),
  spoilageLabel: text("spoilage_label").notNull(),
  recommendedPickupWindowMinutes: integer("recommended_pickup_window_minutes").notNull(),
  isEmergency: boolean("is_emergency").$defaultFn(() => false).notNull(),
  priorityLevel: text("priority_level").$defaultFn(() => "normal").notNull(),
  priorityState: text("priority_state").$defaultFn(() => "passive").notNull(),
  expectedResponseMinutes: integer("expected_response_minutes"),
  assignedVolunteerId: text("assigned_volunteer_id"),
  assignedReceiverId: text("assigned_receiver_id"),
  emergencyActivatedAt: timestamp("emergency_activated_at"),
  emergencyExpiresAt: timestamp("emergency_expires_at"),
  lastDispatchAt: timestamp("last_dispatch_at"),
  status: text("status").notNull().$defaultFn(() => "active"),
  createdAt: timestamp("created_at").$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
  updatedAt: timestamp("updated_at").$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
  lastRiskCalculatedAt: timestamp("last_risk_calculated_at").$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
});

export const donationItem = pgTable("donation_item", {
  id: text("id").primaryKey(),
  donationEventId: text("donation_event_id").notNull().references(() => donationEvent.id, { onDelete: "cascade" }),
  listingId: text("listing_id").references(() => foodListing.id, { onDelete: "set null" }),
  foodName: text("food_name").notNull(),
  foodCategory: text("food_category").notNull(),
  quantity: integer("quantity").notNull(),
  cookedAt: timestamp("cooked_at").notNull(),
  packagingCondition: text("packaging_condition").notNull(),
  storageCondition: text("storage_condition").notNull(),
  spoilageScore: real("spoilage_score").notNull(),
  spoilageLabel: text("spoilage_label").notNull(),
  recommendedPickupWindowMinutes: integer("recommended_pickup_window_minutes").notNull(),
  status: text("status").notNull().$defaultFn(() => "active"),
  createdAt: timestamp("created_at").$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
  updatedAt: timestamp("updated_at").$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
});

export const donationEventAllocation = pgTable("donation_event_allocation", {
  id: text("id").primaryKey(),
  donationEventId: text("donation_event_id").notNull().references(() => donationEvent.id, { onDelete: "cascade" }),
  receiverId: text("receiver_id").notNull(),
  receiverName: text("receiver_name").notNull(),
  allocatedQuantity: integer("allocated_quantity").notNull(),
  etaMinutes: integer("eta_minutes").notNull(),
  allocationType: text("allocation_type").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
});

export const supplierProof = pgTable("supplier_proof", {
  id: text("id").primaryKey(),
  supplierUserId: text("supplier_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  listingId: text("listing_id").references(() => foodListing.id, { onDelete: "set null" }),
  bucket: text("bucket").notNull(),
  filePath: text("file_path").notNull(),
  publicUrl: text("public_url"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
});
