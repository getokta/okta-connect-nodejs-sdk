import type { Ulid } from './common.js';

/**
 * The Partner API's payloads.
 *
 * Every one of these describes a *partner-managed* workspace: an
 * organization the calling partner provisioned and is scoped to. A workspace
 * belonging to another partner answers 404 rather than 403, so these types
 * never describe anyone else's tenant.
 */

/** Abilities a partner credential can carry. A token narrows its key, never widens it. */
export const PartnerAbility = {
  WORKSPACES_READ: 'workspaces.read',
  WORKSPACES_WRITE: 'workspaces.write',
  USERS_READ: 'users.read',
  USERS_WRITE: 'users.write',
  TOKENS_WRITE: 'tokens.write',
  CHANNELS_READ: 'channels.read',
  CHANNELS_WRITE: 'channels.write',
  SSO_ISSUE: 'sso.issue',
  EMBED_MANAGE: 'embed.manage',
} as const;

export type PartnerAbilityValue = (typeof PartnerAbility)[keyof typeof PartnerAbility];

/** Roles a member can hold in a workspace. */
export type WorkspaceRole = 'owner' | 'admin' | 'manager' | 'agent' | 'member';

/** Abilities mintable on a workspace token. `admin` is deliberately absent. */
export type WorkspaceTokenAbility = 'read' | 'write' | 'send' | 'webhooks';

export interface PartnerAccessToken {
  access_token: string;
  token_type: string;
  /** Seconds until expiry. `0` from the platform means "no deadline". */
  expires_in?: number | null;
  expires_at?: string | null;
  abilities?: string[];
}

export interface PartnerIdentity {
  partner: {
    id?: Ulid;
    name?: string;
    slug?: string;
    status?: string;
  };
  token: {
    name?: string;
    kind?: string;
    abilities?: string[];
    expires_at?: string | null;
  };
  workspaces_count?: number;
  [key: string]: unknown;
}

export interface PartnerWorkspace {
  id?: Ulid;
  name?: string;
  slug?: string;
  status?: string;
  /** Your identifier for the account, echoed back. Also the idempotency key. */
  external_id?: string | null;
  locale?: string | null;
  timezone?: string | null;
  country?: string | null;
  plan_key?: string | null;
  trial_ends_at?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface PartnerWorkspaceMember {
  id?: Ulid;
  name?: string;
  email?: string;
  role?: WorkspaceRole | string;
  /** The person's platform-wide account status. */
  status?: string;
  /** Their standing in *this* workspace — the only one a partner governs. */
  membership_status?: string;
  /** Present once, on the response that created the account. */
  one_time_password?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface PartnerWorkspaceToken {
  /** Same value the platform also returns as `token_id`. */
  id?: number | string;
  token_id?: number | string;
  name?: string;
  abilities?: string[];
  /** The plain secret — present only on the mint response. */
  token?: string;
  expires_at?: string | null;
  last_used_at?: string | null;
  [key: string]: unknown;
}

export interface PartnerSsoLink {
  url: string;
  expires_in?: number;
  [key: string]: unknown;
}

export interface PartnerEmbedConfig {
  issued: boolean;
  secret_id?: string | null;
  /** What your JWTs must carry as `iss`. Read it; never assemble it. */
  issuer?: string;
  audience?: string;
  origins?: string[];
  issued_at?: string | null;
  [key: string]: unknown;
}

export interface PartnerEmbedSecret extends PartnerEmbedConfig {
  /** Returned exactly once. Connect keeps a verifier, not the secret. */
  secret: string;
}

export interface PartnerEmbedOrigins {
  origins: string[];
  /**
   * What the platform refused to store. Worth reading: an origin that did not
   * parse fails later as a blank iframe with a 200 and no failed request.
   */
  rejected: string[];
}

/**
 * What `createWorkspace()` returns, including the part the body cannot say:
 * whether this call minted the workspace (201) or matched an existing
 * `external_id` (200). That distinction is the idempotency contract.
 */
export interface WorkspaceProvision {
  workspace: PartnerWorkspace;
  created: boolean;
  owner?: PartnerWorkspaceMember;
  /** The generated owner password, when one was generated. Shown once. */
  oneTimePassword?: string;
}

/**
 * What `addMember()` returns. `created: false` means Connect reused an account
 * it already knew — its password is untouched and none is returned, which is
 * success rather than a missing field.
 */
export interface MembershipResult {
  member: PartnerWorkspaceMember;
  created: boolean;
  oneTimePassword?: string;
}

export interface CreateWorkspaceInput {
  name: string;
  /** Your identifier. Posting the same one twice matches instead of duplicating. */
  external_id?: string;
  slug?: string;
  locale?: string;
  timezone?: string;
  country?: string;
  metadata?: Record<string, unknown>;
  owner?: {
    name: string;
    email: string;
    password?: string;
    password_auto?: boolean;
    locale?: string;
  };
  [key: string]: unknown;
}

export interface AddMemberInput {
  name: string;
  email: string;
  role?: WorkspaceRole;
  password?: string;
  password_auto?: boolean;
  locale?: string;
  [key: string]: unknown;
}

export interface ListWorkspacesQuery {
  search?: string;
  external_id?: string;
  status?: string;
  per_page?: number;
  page?: number;
  /** Anything else is passed through to the query string verbatim. */
  [key: string]: string | number | boolean | null | undefined;
}
