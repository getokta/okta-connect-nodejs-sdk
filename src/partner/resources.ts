import type { Page } from '../http/pagination.js';
import type { RequestOptions } from '../http/http-client.js';
import { Resource } from '../resources/resource.js';
import type { Ulid } from '../types/common.js';
import type { Channel } from '../types/resources.js';
import type {
  AddMemberInput,
  CreateWorkspaceInput,
  ListWorkspacesQuery,
  MembershipResult,
  PartnerEmbedConfig,
  PartnerEmbedOrigins,
  PartnerEmbedSecret,
  PartnerSsoLink,
  PartnerWorkspace,
  PartnerWorkspaceMember,
  PartnerWorkspaceToken,
  WorkspaceProvision,
  WorkspaceTokenAbility,
} from '../types/partner.js';

/** Shared base for `/api/v1/partner/*`. */
abstract class PartnerResource extends Resource {
  protected partner(path: string): string {
    return this.api(`partner/${path.replace(/^\/+/, '')}`);
  }

  protected workspacePath(ulid: Ulid, suffix = ''): string {
    return this.partner(`/workspaces/${this.encode(ulid)}${suffix}`);
  }
}

/**
 * Workspaces you provision and manage.
 *
 * Scope is not a filter you pass — it is the boundary the API holds: every
 * lookup is pinned to the calling partner, and a workspace belonging to
 * someone else answers 404 rather than 403, so nothing leaks about tenants you
 * do not own.
 *
 * Abilities: `workspaces.read` for reads, `workspaces.write` for the rest.
 */
export class PartnerWorkspaces extends PartnerResource {
  /**
   * Create a workspace — or match an existing one.
   *
   * Pass `external_id` and the call becomes idempotent: a repeat returns the
   * same workspace with `created: false` instead of a duplicate, which is what
   * makes retrying after a timeout safe.
   */
  async create(input: CreateWorkspaceInput, options?: RequestOptions): Promise<WorkspaceProvision> {
    const response = await this.http.post<{
      data: PartnerWorkspace;
      owner?: PartnerWorkspaceMember;
    }>(this.partner('/workspaces'), input, options);

    const owner = response.data?.owner;

    return {
      workspace: response.data?.data ?? ({} as PartnerWorkspace),
      // 201 minted it, 200 matched the external_id. The body cannot say which.
      created: response.status === 201,
      owner,
      oneTimePassword: owner?.one_time_password,
    };
  }

  list(query: ListWorkspacesQuery = {}, options?: RequestOptions): Promise<Page<PartnerWorkspace>> {
    return this.getPage<PartnerWorkspace>(this.partner('/workspaces'), query, options);
  }

  /** Walk every page, yielding one workspace at a time. */
  listAll(
    query: ListWorkspacesQuery = {},
    options?: RequestOptions,
  ): AsyncGenerator<PartnerWorkspace, void, undefined> {
    return this.paginate<PartnerWorkspace>(this.partner('/workspaces'), query, options);
  }

  get(ulid: Ulid, options?: RequestOptions): Promise<PartnerWorkspace> {
    return this.getOne<PartnerWorkspace>(this.workspacePath(ulid), undefined, options);
  }

  /**
   * The workspace you filed under this `external_id`, or `null`.
   *
   * The reconciliation primitive: it answers "have I provisioned this account
   * already" without creating anything as a side effect.
   */
  async findByExternalId(externalId: string, options?: RequestOptions): Promise<PartnerWorkspace | null> {
    const page = await this.list({ external_id: externalId, per_page: 1 }, options);

    return page.data[0] ?? null;
  }

  /**
   * `name`, `locale`, `timezone`, `country`, `metadata`. `slug` is immutable
   * once issued — integrations key their own records off it.
   */
  update(
    ulid: Ulid,
    attributes: Partial<CreateWorkspaceInput>,
    options?: RequestOptions,
  ): Promise<PartnerWorkspace> {
    return this.mutate<PartnerWorkspace>('patch', this.workspacePath(ulid), attributes, options);
  }

  /** Your kill switch for an account that churned inside your product. */
  suspend(ulid: Ulid, options?: RequestOptions): Promise<PartnerWorkspace> {
    return this.mutate<PartnerWorkspace>('post', this.workspacePath(ulid, '/suspend'), undefined, options);
  }

  activate(ulid: Ulid, options?: RequestOptions): Promise<PartnerWorkspace> {
    return this.mutate<PartnerWorkspace>('post', this.workspacePath(ulid, '/activate'), undefined, options);
  }
}

/**
 * Membership of a workspace you manage.
 *
 * A partner governs membership, not accounts: you can add someone, change
 * their role, suspend or remove that membership. You cannot rename a user,
 * reset an existing user's password, or see the other workspaces they belong
 * to.
 *
 * Abilities: `users.read` / `users.write`.
 */
export class PartnerWorkspaceUsers extends PartnerResource {
  list(workspaceUlid: Ulid, options?: RequestOptions): Promise<PartnerWorkspaceMember[]> {
    return this.getList<PartnerWorkspaceMember>(
      this.workspacePath(workspaceUlid, '/users'),
      undefined,
      options,
    );
  }

  /**
   * Add a member.
   *
   * An email Connect already knows is reused, never overwritten — the account
   * gains a membership and keeps its password. The result says which happened,
   * so you know whether there is a one-time password to show.
   *
   * Adding someone as `owner` transfers workspace ownership to them.
   */
  async add(
    workspaceUlid: Ulid,
    input: AddMemberInput,
    options?: RequestOptions,
  ): Promise<MembershipResult> {
    const response = await this.http.post<{ data: PartnerWorkspaceMember }>(
      this.workspacePath(workspaceUlid, '/users'),
      input,
      options,
    );

    const member = response.data?.data ?? ({} as PartnerWorkspaceMember);

    return {
      member,
      // 201 minted a new account, 200 attached one that already existed.
      created: response.status === 201,
      oneTimePassword: member.one_time_password,
    };
  }

  /**
   * `role` and/or `status` (`active` | `suspended`). The workspace owner
   * cannot be suspended — hand ownership over first.
   */
  update(
    workspaceUlid: Ulid,
    userUlid: Ulid,
    attributes: { role?: string; status?: string },
    options?: RequestOptions,
  ): Promise<PartnerWorkspaceMember> {
    return this.mutate<PartnerWorkspaceMember>(
      'patch',
      this.workspacePath(workspaceUlid, `/users/${this.encode(userUlid)}`),
      attributes,
      options,
    );
  }

  /**
   * Drop the membership. The user account survives — it is not yours to
   * delete. The owner cannot be removed; transfer first.
   */
  async remove(workspaceUlid: Ulid, userUlid: Ulid, options?: RequestOptions): Promise<boolean> {
    const response = await this.http.delete<{ deleted?: boolean }>(
      this.workspacePath(workspaceUlid, `/users/${this.encode(userUlid)}`),
      undefined,
      options,
    );

    return this.confirmedDeleted(response.data);
  }
}

/**
 * Tenant API tokens for a workspace you manage — the credential your product
 * uses to act on that workspace's own data plane (`/api/v1/*`), without a
 * human copy-pasting a key out of the dashboard.
 *
 * Ability: `tokens.write` (it covers reads here too).
 */
export class PartnerWorkspaceTokens extends PartnerResource {
  async list(workspaceUlid: Ulid, options?: RequestOptions): Promise<PartnerWorkspaceToken[]> {
    const tokens = await this.getList<PartnerWorkspaceToken>(
      this.workspacePath(workspaceUlid, '/tokens'),
      undefined,
      options,
    );

    return tokens.map(normaliseTokenId);
  }

  /**
   * Mint a token for one member of the workspace.
   *
   * `abilities` is a subset of `read`, `write`, `send`, `webhooks`; `admin`
   * and every `platform.*` grant are refused server-side.
   *
   * The plain secret is on the returned object and nowhere else — store it
   * now, along with `id`, which is what revokes it on rotation.
   */
  async create(
    workspaceUlid: Ulid,
    input: {
      name: string;
      user_id: Ulid;
      abilities?: WorkspaceTokenAbility[];
      expires_at?: string;
    },
    options?: RequestOptions,
  ): Promise<PartnerWorkspaceToken> {
    const token = await this.mutate<PartnerWorkspaceToken>(
      'post',
      this.workspacePath(workspaceUlid, '/tokens'),
      { abilities: ['read'], ...input },
      options,
    );

    return normaliseTokenId(token);
  }

  /** Revoke one token by its numeric id (`id`, a.k.a. `token_id`). */
  async revoke(
    workspaceUlid: Ulid,
    tokenId: number | string,
    options?: RequestOptions,
  ): Promise<boolean> {
    const response = await this.http.delete<{ revoked?: boolean }>(
      this.workspacePath(workspaceUlid, `/tokens/${this.encode(String(tokenId))}`),
      undefined,
      options,
    );

    return this.confirmedDeleted(response.data, 'revoked');
  }
}

/**
 * Channels inside a workspace you manage.
 *
 * Creating one reserves a stable id; it does **not** hand you the customer's
 * provider credentials. Those are attached later by the workspace's own people
 * through the dashboard OAuth flows.
 *
 * WhatsApp QR pairing is deliberately elsewhere: it runs with a *workspace*
 * token, because the channel belongs to the workspace, not to you.
 *
 * Abilities: `channels.read` / `channels.write`.
 */
export class PartnerWorkspaceChannels extends PartnerResource {
  list(workspaceUlid: Ulid, options?: RequestOptions): Promise<Channel[]> {
    return this.getList<Channel>(this.workspacePath(workspaceUlid, '/channels'), undefined, options);
  }

  /**
   * Reserve a channel. It lands `disconnected` with no credentials — the
   * intended end state of this call, not a failure.
   */
  create(
    workspaceUlid: Ulid,
    input: { display_name: string; type: string; phone_number?: string },
    options?: RequestOptions,
  ): Promise<Channel> {
    return this.mutate<Channel>(
      'post',
      this.workspacePath(workspaceUlid, '/channels'),
      input,
      options,
    );
  }
}

/**
 * One-time sign-in links: send an existing member straight into the dashboard,
 * already signed in.
 *
 * Note what this is not. It creates no accounts and grants no roles — the user
 * must already be an active member, and membership is re-checked at redemption
 * rather than only at issue. Remove someone in the meantime and the link they
 * are holding is dead.
 *
 * Ability: `sso.issue`.
 */
export class PartnerSso extends PartnerResource {
  /** `redirect` must start with `/app/`; anything else falls back to `/app`. */
  issue(
    workspaceUlid: Ulid,
    userUlid: Ulid,
    redirect?: string,
    options?: RequestOptions,
  ): Promise<PartnerSsoLink> {
    const body: Record<string, unknown> = { user_id: userUlid };

    if (redirect !== undefined) body.redirect = redirect;

    return this.mutate<PartnerSsoLink>(
      'post',
      this.workspacePath(workspaceUlid, '/sso'),
      body,
      options,
    );
  }
}

/**
 * Your embed signing key and the origins allowed to frame the inbox.
 *
 * The key is bound to your partner organization, and that binding is what
 * makes handing it to you defensible: a token signed with it resolves only to
 * a user who already exists and is an active member of a workspace you manage.
 * It cannot create an account, grant a role, or name anyone else's workspace.
 *
 * Ability: `embed.manage`.
 */
export class PartnerEmbed extends PartnerResource {
  /** Read the configuration. Never returns the secret — nothing can. */
  show(options?: RequestOptions): Promise<PartnerEmbedConfig> {
    return this.getOne<PartnerEmbedConfig>(this.partner('/embed'), undefined, options);
  }

  /**
   * Issue or rotate the key. The secret comes back exactly once.
   *
   * Rotation does not overlap: the previous secret stops verifying the moment
   * this resolves, so re-mint live iframe tokens afterwards.
   *
   * @param origins Omit to keep the registered list.
   */
  issueSecret(origins?: string[], options?: RequestOptions): Promise<PartnerEmbedSecret> {
    return this.mutate<PartnerEmbedSecret>(
      'post',
      this.partner('/embed/secret'),
      origins === undefined ? {} : { origins },
      options,
    );
  }

  /**
   * Replace the framing allowlist wholesale.
   *
   * Check `rejected` — an origin that did not parse is simply absent from the
   * stored list, and the symptom arrives as a blank iframe with a 200 and no
   * failed request.
   */
  setOrigins(origins: string[], options?: RequestOptions): Promise<PartnerEmbedOrigins> {
    return this.mutate<PartnerEmbedOrigins>(
      'put',
      this.partner('/embed/origins'),
      { origins },
      options,
    );
  }
}

/**
 * The platform returns the same numeric identifier under `id` and `token_id`,
 * because the mint response used one name while the revoke route documented
 * the other. Fill in whichever is missing so a client that reads either one
 * never stores null and finds out at rotation time.
 */
function normaliseTokenId(token: PartnerWorkspaceToken): PartnerWorkspaceToken {
  const id = token.id ?? token.token_id;

  return id === undefined ? token : { ...token, id, token_id: id };
}
