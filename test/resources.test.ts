import { describe, expect, it } from 'vitest';
import { Page } from '../src/index.js';
import { paginated, stubFetch, testClient } from './helpers.js';

describe('messages', () => {
  it('sendText builds the flat channel_id + wa_id shape', async () => {
    const { client, stub } = testClient({ body: { data: { id: '01HMSG', status: 'queued' } } });

    const message = await client.messages.sendText('01HCH', '966500000000', 'Hello');

    const request = stub.last();
    expect(request.method).toBe('POST');
    expect(request.path).toBe('/api/v1/messages');
    expect(request.body).toEqual({
      channel_id: '01HCH',
      wa_id: '966500000000',
      type: 'text',
      body: 'Hello',
    });
    expect(message.status).toBe('queued');
  });

  it('sendMedia carries media_url with the caption as body', async () => {
    const { client, stub } = testClient({ body: { data: {} } });

    await client.messages.sendMedia(
      '01HCH',
      '966500000000',
      'image',
      'https://cdn.test/a.jpg',
      'Look!',
    );

    expect(stub.last().body).toEqual({
      channel_id: '01HCH',
      wa_id: '966500000000',
      type: 'image',
      body: 'Look!',
      media_url: 'https://cdn.test/a.jpg',
    });
  });

  it('reply addresses an existing conversation', async () => {
    const { client, stub } = testClient({ body: { data: {} } });

    await client.messages.reply('01HCONV', 'Thanks!');

    expect(stub.last().body).toEqual({
      conversation_id: '01HCONV',
      type: 'text',
      body: 'Thanks!',
    });
  });

  it('list hits the conversation-scoped route and drops conversation_id from the query', async () => {
    const { client, stub } = testClient({ body: paginated([{ id: '01HMSG' }]) });

    const page = await client.messages.list({ conversation_id: '01HCONV', per_page: 50 });

    const request = stub.last();
    expect(request.path).toBe('/api/v1/conversations/01HCONV/messages');
    expect(request.query.get('per_page')).toBe('50');
    expect(request.query.has('conversation_id')).toBe(false);
    expect(page).toBeInstanceOf(Page);
    expect(page.data).toHaveLength(1);
  });
});

describe('contacts', () => {
  it('upserts by wa_id', async () => {
    const { client, stub } = testClient({ body: { data: { id: '01HC', wa_id: '9665' } } });

    await client.contacts.upsert({ wa_id: '966500000000', name: 'Ali', phone: '+966500000000' });

    const request = stub.last();
    expect(request.method).toBe('POST');
    expect(request.path).toBe('/api/v1/contacts');
    expect(request.body).toEqual({
      wa_id: '966500000000',
      name: 'Ali',
      phone: '+966500000000',
    });
  });

  it('applyTags posts the slug list', async () => {
    const { client, stub } = testClient({ body: { data: { id: '01HC' } } });

    await client.contacts.applyTags('01HC', ['vip', 'riyadh']);

    expect(stub.last().path).toBe('/api/v1/contacts/01HC/tags');
    expect(stub.last().body).toEqual({ tags: ['vip', 'riyadh'] });
  });
});

describe('channels', () => {
  it('whatsapp() uses the family alias', async () => {
    const { client, stub } = testClient({ body: paginated([]) });

    await client.channels.whatsapp('connected');

    expect(stub.last().query.get('type')).toBe('whatsapp');
    expect(stub.last().query.get('status')).toBe('connected');
  });

  it('awaitingScan() filters on the awaiting_scan status', async () => {
    const { client, stub } = testClient({ body: paginated([]) });

    await client.channels.awaitingScan('baileys');

    expect(stub.last().query.get('type')).toBe('baileys');
    expect(stub.last().query.get('status')).toBe('awaiting_scan');
  });

  it('delete() reports the confirmed removal', async () => {
    const { client, stub } = testClient({ body: { deleted: true } });

    await expect(client.channels.delete('01HCH')).resolves.toBe(true);
    expect(stub.last().method).toBe('DELETE');
  });

  it('delete() reports false when the platform does not confirm', async () => {
    const { client } = testClient({ body: {} });

    await expect(client.channels.delete('01HCH')).resolves.toBe(false);
  });
});

describe('templates', () => {
  it('list returns a flat array (the catalogue is not paginated)', async () => {
    const { client, stub } = testClient({
      body: { data: [{ id: '01HT', name: 'order_ready', status: 'APPROVED' }] },
    });

    const templates = await client.templates.list({ status: 'APPROVED', language: 'ar' });

    expect(Array.isArray(templates)).toBe(true);
    expect(templates[0]?.name).toBe('order_ready');
    expect(stub.last().query.get('status')).toBe('APPROVED');
  });

  it('send posts to /templates/send', async () => {
    const { client, stub } = testClient({ body: { data: { id: '01HMSG' } } });

    await client.templates.send({
      channel_id: '01HCH',
      wa_id: '966500000000',
      template_name: 'order_ready',
      language: 'ar',
      variables: ['12345', '120 SAR'],
    });

    expect(stub.last().path).toBe('/api/v1/templates/send');
    expect(stub.last().body).toMatchObject({ template_name: 'order_ready', language: 'ar' });
  });
});

describe('emails', () => {
  it('send posts the message payload', async () => {
    const { client, stub } = testClient({ body: { data: { id: '01HE', status: 'queued' } } });

    const email = await client.emails.send({
      from: 'Acme <hello@mail.acme.com>',
      to: ['ali@example.com'],
      subject: 'Your receipt',
      html: '<h1>Thanks!</h1>',
    });

    expect(stub.last().path).toBe('/api/v1/emails');
    expect(email.status).toBe('queued');
  });

  it('sendHtml normalises a single recipient to a list', async () => {
    const { client, stub } = testClient({ body: { data: {} } });

    await client.emails.sendHtml('Acme <a@b.c>', 'ali@example.com', 'Hi', '<p>Hi</p>');

    expect(stub.last().body).toMatchObject({ to: ['ali@example.com'], html: '<p>Hi</p>' });
  });

  it('sendTemplate carries template + variables', async () => {
    const { client, stub } = testClient({ body: { data: {} } });

    await client.emails.sendTemplate('Acme <a@b.c>', ['ali@example.com'], 'order-receipt', {
      order_id: '1042',
    });

    expect(stub.last().body).toMatchObject({
      template: 'order-receipt',
      variables: { order_id: '1042' },
    });
  });

  it('routes nested accessors to their own paths', async () => {
    const stub = stubFetch({ body: { data: { id: '01HT' } } });
    const { client } = testClient([], { fetch: stub.fetch });

    await client.emails.templates.create({ name: 'Order receipt' });
    expect(stub.last().path).toBe('/api/v1/email-templates');

    await client.emails.broadcasts.queue('01HB');
    expect(stub.last().path).toBe('/api/v1/emails/broadcasts/01HB/queue');

    await client.emails.suppressions.add('bounced@example.com');
    expect(stub.last().path).toBe('/api/v1/emails/suppressions');
    expect(stub.last().body).toEqual({ address: 'bounced@example.com' });
  });

  it('analytics defaults summary and series when the window is empty', async () => {
    const { client } = testClient({ body: { data: { from: '2026-06-01', to: '2026-06-30' } } });

    const stats = await client.emails.analytics({ from: '2026-06-01', to: '2026-06-30' });

    expect(stats.summary).toEqual({});
    expect(stats.series).toEqual([]);
  });
});

describe('social posts', () => {
  it('schedule includes scheduled_at and media', async () => {
    const { client, stub } = testClient({ body: { data: { id: '01HP' } } });

    await client.socialPosts.schedule(
      'New drop!',
      ['01HCH1', '01HCH2'],
      '2026-07-20T09:00:00+00:00',
      [{ url: 'https://cdn.test/a.jpg', type: 'image' }],
    );

    expect(stub.last().body).toEqual({
      text: 'New drop!',
      channel_ids: ['01HCH1', '01HCH2'],
      scheduled_at: '2026-07-20T09:00:00+00:00',
      media: [{ url: 'https://cdn.test/a.jpg', type: 'image' }],
    });
  });

  it('draft omits scheduled_at entirely', async () => {
    const { client, stub } = testClient({ body: { data: {} } });

    await client.socialPosts.draft('Behind the scenes…', ['01HCH1']);

    expect(stub.last().body).toEqual({
      text: 'Behind the scenes…',
      channel_ids: ['01HCH1'],
    });
  });
});

describe('campaigns, tickets, tags, analytics', () => {
  it('queues a campaign', async () => {
    const { client, stub } = testClient({ body: { data: { id: '01HCM', status: 'queueing' } } });

    await client.campaigns.queue('01HCM');

    expect(stub.last().path).toBe('/api/v1/campaigns/01HCM/queue');
    expect(stub.last().method).toBe('POST');
  });

  it('opens and transitions a ticket', async () => {
    const stub = stubFetch({ body: { data: { id: '01HTK' } } });
    const { client } = testClient([], { fetch: stub.fetch });

    await client.tickets.open({ subject: 'Order stuck', contact_id: '01HC' });
    expect(stub.last().path).toBe('/api/v1/tickets');

    await client.tickets.transition('01HTK', { stage_id: '01HSTG' });
    expect(stub.last().path).toBe('/api/v1/tickets/01HTK/transition');
    expect(stub.last().body).toEqual({ stage_id: '01HSTG' });
  });

  it('applies tags to a contact', async () => {
    const { client, stub } = testClient({ body: { data: { id: '01HC' } } });

    await client.tags.applyToContact('01HC', ['vip']);

    expect(stub.last().path).toBe('/api/v1/contacts/01HC/tags');
  });

  it('reads a single analytics metric', async () => {
    const { client } = testClient({
      body: { data: { from: '2026-06-01', metrics: { 'messages.inbound': 120 } } },
    });

    await expect(client.analytics.metric('messages.inbound')).resolves.toBe(120);
  });

  it('falls back when a metric key is absent', async () => {
    const { client } = testClient({ body: { data: { metrics: {} } } });

    await expect(client.analytics.metric('messages.outbound', {}, -1)).resolves.toBe(-1);
  });
});

describe('groups', () => {
  it('creates a group', async () => {
    const { client, stub } = testClient({ body: { data: { id: '01HG', subject: 'Sales pod' } } });

    await client.groups.create('Sales pod', ['966500000000', '966500000001']);

    expect(stub.last().body).toEqual({
      subject: 'Sales pod',
      participants: ['966500000000', '966500000001'],
    });
  });

  it('unwraps the nested participant results', async () => {
    const { client, stub } = testClient({
      body: { data: { results: [{ jid: '9665@s.whatsapp.net', status: 'added' }] } },
    });

    const results = await client.groups.addParticipants('01HG', ['966500000002']);

    expect(results).toEqual([{ jid: '9665@s.whatsapp.net', status: 'added' }]);
    expect(stub.last().path).toBe('/api/v1/groups/01HG/participants');
  });

  it('removes participants over DELETE with a body', async () => {
    const { client, stub } = testClient({ body: { data: { results: [] } } });

    await client.groups.removeParticipants('01HG', ['966500000002']);

    expect(stub.last().method).toBe('DELETE');
    expect(stub.last().body).toEqual({ participants: ['966500000002'] });
  });
});

describe('integrations', () => {
  it('reads the Meta config from the integrations path', async () => {
    const { client, stub } = testClient({ body: { app_id: '123', graph_version: 'v22.0' } });

    const config = await client.meta.config();

    expect(stub.last().path).toBe('/api/integrations/meta/config');
    expect(config.app_id).toBe('123');
  });

  it('returns the channels created by embedded signup', async () => {
    const { client } = testClient({ body: { channels: [{ id: '01HCH' }] } });

    const channels = await client.meta.completeEmbeddedSignup('code-1', 'waba-1');

    expect(channels).toHaveLength(1);
  });

  it('starts and polls a QR session', async () => {
    const stub = stubFetch({ body: { id: '01HQR', status: 'awaiting_scan', qr: '2@abc' } });
    const { client } = testClient([], { fetch: stub.fetch });

    await client.qr.start('Sales line');
    expect(stub.last().path).toBe('/api/integrations/qr/sessions');
    expect(stub.last().body).toEqual({ display_name: 'Sales line' });

    const session = await client.qr.status('01HQR');
    expect(stub.last().path).toBe('/api/integrations/qr/sessions/01HQR');
    expect(session.qr).toBe('2@abc');
  });
});

describe('connection introspection', () => {
  it('reads the grant', async () => {
    const { client, stub } = testClient({
      body: {
        data: {
          app_name: 'My CRM',
          abilities: ['read', 'send'],
          organization: { id: '01HO', name: 'Acme' },
        },
      },
    });

    const connection = await client.connection();

    expect(stub.last().path).toBe('/api/v1/oauth/introspect');
    expect(connection.abilities).toEqual(['read', 'send']);
    expect(connection.organization?.name).toBe('Acme');
  });

  it('answers can() and missing() from the grant', async () => {
    const stub = stubFetch({ body: { data: { app_name: 'x', abilities: ['read'] } } });
    const { client } = testClient([], { fetch: stub.fetch });

    await expect(client.can('read')).resolves.toBe(true);
    await expect(client.can('admin')).resolves.toBe(false);
    await expect(client.missing(['read', 'admin'])).resolves.toEqual(['admin']);
  });

  it('revokes the connection', async () => {
    const { client, stub } = testClient({ body: { revoked: true } });

    await expect(client.revokeConnection()).resolves.toBe(true);
    expect(stub.last().path).toBe('/api/v1/oauth/revoke');
  });
});
