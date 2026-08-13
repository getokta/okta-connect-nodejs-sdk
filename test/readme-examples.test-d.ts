/**
 * Compile-time check of the README's examples. Nothing here runs — the file
 * exists so `tsc --noEmit` fails when a documented snippet stops type-checking.
 * A doc example that doesn't compile is a bug, and this is what catches it.
 */
import {
  Connect,
  HtmlMessageBuilder,
  OktaConnect,
  RateLimitError,
  UiHide,
  ValidationError,
  WebhookEvents,
  WebhookRouter,
  parseWebhook,
  verifyWebhookSignature,
} from '../src/index.js';

declare const channelId: string;
declare const conversationId: string;
declare const contactId: string;
declare const templateId: string;
declare const emailId: string;
declare const resolvedStageId: string;
declare const xChannelId: string;
declare const telegramChannelId: string;
declare const instagramChannelId: string;
declare const waId: string;
declare const rawBody: Buffer;
declare const secret: string;
declare const sharedSecret: string;
declare const baseUrl: string;
declare function sleep(ms: number): Promise<void>;
declare function handle(a: unknown, b: unknown): void;
declare function teardown(a: unknown): void;
declare function reply(a: unknown): void;
declare function log(a: unknown): void;
declare function sync(a: unknown): void;
declare function billing(a: unknown): void;
declare function audit(a: unknown): void;
declare const vault: { put(key: string, value: unknown): Promise<void> };
declare const req: { query: Record<string, string>; header(name: string): string | undefined };

export async function quickstart(): Promise<void> {
  const client = new OktaConnect({
    baseUrl: 'https://connect.getokta.io',
    token: process.env.OKTA_CONNECT_TOKEN,
  });

  await client.messages.sendText(channelId, '966500000000', 'Your order is on the way!');

  const conversations = await client.conversations.list({ status: 'open' });

  for (const conversation of conversations) {
    console.log(conversation.id, conversation.unread_count);
  }

  const connection = await client.connection();
  void connection.abilities;
  await client.can('admin');
  await client.missing(['read', 'admin']);
}

export async function messaging(client: OktaConnect): Promise<void> {
  await client.messages.sendText(channelId, '966500000000', 'Hello');
  await client.messages.sendMedia(
    channelId,
    '966500000000',
    'image',
    'https://cdn.acme.com/a.jpg',
    'Look!',
  );
  await client.messages.reply(conversationId, 'Thanks!');
  await client.messages.send({
    channel_id: channelId,
    wa_id: '966500000000',
    type: 'text',
    body: 'Hello',
  });

  await client.conversations.get(conversationId);
  await client.conversations.messages(conversationId, { per_page: 50 });

  await client.contacts.upsert({ wa_id: '966500000000', name: 'Ali', phone: '+966500000000' });
  await client.contacts.list({ search: '+966' });
  await client.tags.applyToContact(contactId, ['vip', 'riyadh']);

  await client.channels.list({ type: 'telegram', status: 'connected' });
  await client.channels.whatsapp('connected');
  await client.channels.connected();

  for await (const stale of client.channels.listAll({ status: 'awaiting_scan' })) {
    await client.channels.delete(stale.id);
  }

  await client.templates.list({ status: 'APPROVED', language: 'ar' });
  await client.templates.send({
    channel_id: channelId,
    wa_id: '966500000000',
    template_name: 'order_ready',
    language: 'ar',
    variables: ['12345', '120 SAR'],
  });

  const group = await client.groups.create('Sales pod', ['966500000000', '966500000001']);
  await client.groups.addParticipants(group.id, ['966500000002']);
  await client.groups.update(group.id, { subject: 'Renamed pod' });
  await client.groups.sync(group.id);
}

export async function email(client: OktaConnect): Promise<void> {
  const sent = await client.emails.send(
    {
      from: 'Acme <hello@mail.acme.com>',
      to: ['ali@example.com'],
      subject: 'Your receipt',
      html: '<h1>Thanks!</h1>',
      text: 'Thanks!',
    },
    { idempotencyKey: 'order-1042-receipt' },
  );

  void sent.status;

  await client.emails.sendTemplate(
    'Acme <hello@mail.acme.com>',
    ['ali@example.com'],
    'order-receipt',
    { order_id: '1042' },
  );

  await client.emails.list({ status: 'delivered', per_page: 50 });
  await client.emails.get(emailId);

  const stats = await client.emails.analytics({ from: '2026-06-01', to: '2026-06-30' });
  void stats.summary.delivery_rate;

  await client.emails.templates.create({
    name: 'Order receipt',
    subject: 'Your order {{ order_id }} is confirmed',
    html: '<p>Hi {{ name }}, order {{ order_id }} is on the way.</p>',
  });

  const broadcast = await client.emails.broadcasts.create({
    name: 'July newsletter',
    from: 'Acme <hello@mail.acme.com>',
    subject: "What's new in July",
    html: '<h1>Hello!</h1>',
    audience: { tag_slugs: ['newsletter'] },
  });
  await client.emails.broadcasts.queue(broadcast.id);

  await client.emails.suppressions.add('bounced@example.com');
  await client.emails.suppressions.remove('bounced@example.com');

  const message = HtmlMessageBuilder.make()
    .brandColor('#D6F85C')
    .logo('https://cdn.acme.com/logo.png')
    .preheader('طلبك في الطريق')
    .heading('شكراً لطلبك!')
    .paragraph('طلبك رقم 1042 قيد التجهيز الآن.')
    .button('تتبع الطلب', 'https://acme.com/orders/1042')
    .divider()
    .footer('© 2026 Acme');

  await client.emails.sendHtml(
    'Acme <hello@mail.acme.com>',
    'ali@example.com',
    'طلبك رقم 1042',
    message,
  );
}

export async function publishing(client: OktaConnect): Promise<void> {
  const post = await client.socialPosts.schedule(
    'New drop is live! 🎉',
    [xChannelId, telegramChannelId],
    '2026-07-20T09:00:00+00:00',
    [{ url: 'https://cdn.acme.com/promo.jpg', type: 'image' }],
  );

  await client.socialPosts.draft('Behind the scenes…', [instagramChannelId]);

  for (const target of (await client.socialPosts.get(post.id)).targets ?? []) {
    console.log(target.status, target.permalink);
  }

  const campaign = await client.campaigns.create({
    name: 'Ramadan promo',
    channel_id: channelId,
    template_id: templateId,
    audience_filter: { tag_slugs: ['vip'] },
  });
  await client.campaigns.queue(campaign.id);

  const ticket = await client.tickets.open({ subject: 'Order stuck', contact_id: contactId });
  await client.tickets.transition(ticket.id, { stage_id: resolvedStageId });
  await client.tickets.list({ status: 'open' });

  const metrics = await client.analytics.metrics({ from: '2026-06-01', to: '2026-06-30' });
  void metrics.metrics['messages.inbound'];
  await client.analytics.metric('messages.outbound');
}

export async function pagination(client: OktaConnect): Promise<void> {
  const page = await client.contacts.list({ per_page: 50 });

  void page.data;
  void page.total;
  void page.hasMore;
  void page.nextPage;

  for (const contact of page) console.log(contact.name);

  for await (const contact of client.contacts.listAll({ search: '+966' })) {
    console.log(contact.name);
  }
}

export async function connectFlow(): Promise<void> {
  const connect = new Connect('https://connect.getokta.io');
  const redirectUri = 'https://crm.example.com/okta/callback';

  const state = Connect.generateState();

  const url = connect.authorizationUrl({
    appName: 'My CRM',
    redirectUri,
    abilities: ['read', 'send'],
    state,
    logoUrl: 'https://cdn.my-crm.com/logo.png',
  });
  void url;

  const token = await connect.handleCallback(req.query, redirectUri, state);

  const client = new OktaConnect({ baseUrl, token: token.access_token });
  void token.abilities;

  await client.revokeConnection();
}

export async function webhooks(client: OktaConnect): Promise<void> {
  const hook = await client.webhooks.create({
    name: 'Lifecycle',
    url: 'https://example.test/hooks/okta',
    events: [WebhookEvents.MessageReceived, WebhookEvents.ChannelDeleted],
  });

  await vault.put('okta-webhook-secret', hook.secret);
  await client.webhooks.list();
  await client.webhooks.delete(hook.id);

  const ok = verifyWebhookSignature(rawBody, req.header('X-Okta-Signature'), secret);
  void ok;

  const delivery = parseWebhook(rawBody, req.header('X-Okta-Signature'), secret);

  switch (delivery.event) {
    case WebhookEvents.MessageReceived:
      handle(delivery.payload.conversation?.id, delivery.payload.message?.body);
      break;
    case WebhookEvents.ChannelDeleted:
      teardown(delivery.payload.channel_id);
      break;
  }

  const router = new WebhookRouter(secret)
    .on(WebhookEvents.MessageReceived, (h) => reply(h.payload.conversation?.id))
    .onMessage((h) => log(h.payload.message?.status))
    .onChannel((h) => sync(h.payload.channel_id))
    .onSubscription((h) => billing(h.payload.status))
    .onAny((h) => audit(h));

  await router.dispatch(rawBody, req.header('X-Okta-Signature'));
}

export function embedding(client: OktaConnect): void {
  const embed = client.embed(sharedSecret);
  const operator = { sub: 'partner-user-7', email: 'op@acme.com', name: 'Op' };

  const src = embed.inboxUrl(operator, { uiHide: [UiHide.AI, UiHide.ASSIGN_AGENT] });
  void src;

  const headers = embed.tokenHeader(embed.sessionToken(operator));
  void headers;

  const ssoUrl = embed.ssoUrl(operator, '/app/inbox?embedded=1');
  void ssoUrl;
}

export async function errorHandling(client: OktaConnect): Promise<void> {
  try {
    await client.messages.sendText(channelId, waId, 'Hello');
  } catch (error) {
    if (error instanceof RateLimitError) {
      await sleep((error.retryAfter ?? 1) * 1000);
    } else if (error instanceof ValidationError) {
      console.error(error.fields, error.first('wa_id'));
    } else {
      throw error;
    }
  }

  const response = await client.http.get<{ data: unknown }>('/api/v1/something-new');
  void response.data;

  const controller = new AbortController();
  await client.contacts.list({}, { signal: controller.signal, timeout: 5_000 });
}
