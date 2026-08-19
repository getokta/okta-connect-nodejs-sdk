import { AuthenticationError } from '../http/errors.js';
import { HttpClient, type HttpRequest, type HttpResponse } from '../http/http-client.js';
import type { PartnerTokenStore } from './token-store.js';

/**
 * The transport every Partner API call goes through: the base client, with a
 * live bearer attached per request and one retry on a 401.
 *
 * The retry is the point. A partner process that stays up for hours will
 * eventually hold a token the platform has already expired — clock drift, a
 * revoked key, a deploy that paused mid-run. One re-exchange and one replay
 * turn that into a request that works. Twice would be a loop, so the second
 * failure is raised as-is.
 */
export class PartnerHttp extends HttpClient {
  constructor(
    config: ConstructorParameters<typeof HttpClient>[0],
    private readonly tokens: PartnerTokenStore,
  ) {
    super(config);
  }

  override async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    const token = await this.tokens.get();

    try {
      return await super.request<T>(withBearer(request, token));
    } catch (error) {
      if (!(error instanceof AuthenticationError) || !this.tokens.exchangeable) {
        throw error;
      }

      const fresh = await this.tokens.refresh(token);

      return super.request<T>(withBearer(request, fresh));
    }
  }
}

function withBearer(request: HttpRequest, token: string): HttpRequest {
  return {
    ...request,
    headers: { ...request.headers, authorization: `Bearer ${token}` },
  };
}
