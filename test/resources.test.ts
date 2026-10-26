import { describe, expect, it } from 'vitest';
import { NotFoundError, Page, ValidationError } from '../src/index.js';
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
  it('exposes supports_templates and waba_id', async () => {
    const { client } = testClient({
      body: paginated([
        { id: '01HCH1', type: 'cloud_api', supports_templates: true, waba_id: 'WABA1' },
        { id: '01HCH2', type: 'baileys', supports_templates: false, waba_id: null },
      ]),
    });

    const page = await client.channels.list();
    const capable = page.data.filter((channel) => channel.supports_templates === true);

    expect(capable.map((channel) => channel.id)).toEqual(['01HCH1']);
    expect(capable[0]?.waba_id).toBe('WABA1');
  });

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

  it('list forwards category, group and preset_key and exposes the new fields', async () => {
    const { client, stub } = testClient({
      body: {
        data: [
          {
            id: '01HT',
            name: 'order_shipped',
            status: 'draft',
            group: 'Orders',
            preset_key: 'order_shipped',
            channel_id: '01HCH',
            example_variables: ['Sara', '12345'],
          },
        ],
      },
    });

    const [template] = await client.templates.list({
      category: 'UTILITY',
      group: 'Orders',
      preset_key: 'order_shipped',
    });

    expect(template?.group).toBe('Orders');
    expect(template?.preset_key).toBe('order_shipped');
    expect(template?.channel_id).toBe('01HCH');
    expect(template?.example_variables).toEqual(['Sara', '12345']);
    expect(stub.last().query.get('category')).toBe('UTILITY');
    expect(stub.last().query.get('group')).toBe('Orders');
    expect(stub.last().query.get('preset_key')).toBe('order_shipped');
  });

  it('save posts the definition, keeping an explicit null group', async () => {
    const { client, stub } = testClient({
      status: 201,
      body: { data: { id: '01HT', name: 'notice', group: null, status: 'draft' } },
    });

    const template = await client.templates.save({
      name: 'notice',
      language: 'ar',
      body_text: 'Hello {{1}}, thanks for your order.',
      example_variables: ['Sara'],
      group: null,
    });

    expect(template.id).toBe('01HT');
    expect(stub.last().method).toBe('POST');
    expect(stub.last().path).toBe('/api/v1/templates');
    expect(stub.last().body).toHaveProperty('group', null);
  });

  it('save sends buttons and the template exposes them', async () => {
    const buttons = [
      { type: 'QUICK_REPLY', text: 'Confirm' },
      { type: 'URL', text: 'Track', url: 'https://example.com/t/1' },
      { type: 'PHONE_NUMBER', text: 'Call us', phone_number: '+966500000000' },
    ] as const;
    const { client, stub } = testClient({
      status: 201,
      body: { data: { id: '01HT', name: 'notice', buttons } },
    });

    const template = await client.templates.save({
      name: 'notice',
      language: 'ar',
      body_text: 'Hello {{1}}, thanks for your order.',
      buttons: [...buttons],
    });

    expect(stub.last().body).toHaveProperty('buttons', buttons);
    expect(template.buttons).toEqual(buttons);
    const url = template.buttons?.find((b) => b.type === 'URL');
    expect(url?.type === 'URL' ? url.url : null).toBe('https://example.com/t/1');
  });

  it('save without buttons leaves the key out so stored ones are kept', async () => {
    const { client, stub } = testClient({
      body: { data: { id: '01HT', buttons: [{ type: 'QUICK_REPLY', text: 'Ok' }] } },
    });

    await client.templates.save({
      name: 'notice',
      language: 'ar',
      body_text: 'Hello {{1}}, thanks for your order.',
    });

    expect(stub.last().body).not.toHaveProperty('buttons');
  });

  it('save with an empty button list sends [] to clear them', async () => {
    const { client, stub } = testClient({ body: { data: { id: '01HT', buttons: null } } });

    const template = await client.templates.save({
      name: 'notice',
      language: 'ar',
      body_text: 'Hello {{1}}, thanks for your order.',
      buttons: [],
    });

    expect(stub.last().body).toHaveProperty('buttons', []);
    expect(template.buttons).toBeNull();
  });

  it('submit posts to /templates/{id}/submit with the optional channel', async () => {
    const { client, stub } = testClient({ body: { data: { id: '01HT', status: 'pending' } } });

    const submitted = await client.templates.submit('01HT', '01HCH');
    expect(submitted.status).toBe('pending');
    expect(stub.last().path).toBe('/api/v1/templates/01HT/submit');
    expect(stub.last().body).toEqual({ channel_id: '01HCH' });

    await client.templates.submit('01HT');
    expect(stub.last().body).toEqual({});
  });

  it('submit surfaces no_template_capable_channel as a ValidationError', async () => {
    const { client } = testClient({
      status: 422,
      body: { message: 'no_template_capable_channel' },
    });

    await expect(client.templates.submit('01HT')).rejects.toBeInstanceOf(ValidationError);
  });

  it('delete confirms the removal', async () => {
    const { client, stub } = testClient({ body: { deleted: true } });

    await expect(client.templates.delete('01HT')).resolves.toBe(true);
    expect(stub.last().method).toBe('DELETE');
    expect(stub.last().path).toBe('/api/v1/templates/01HT');
  });

  it('presets lists the library and forwards the filters', async () => {
    const { client, stub } = testClient({
      body: {
        data: [
          {
            key: 'order_shipped',
            name: 'order_shipped',
            group: 'commerce',
            group_label: 'Commerce',
            category: 'utility',
            title: 'Order shipped',
            description: 'Tell the customer the order is on its way.',
            languages: ['ar', 'en'],
            variants: [
              {
                language: 'en',
                header_type: null,
                header_text: null,
                body_text: 'Hello {{1}}, order {{2}} has shipped today.',
                footer_text: null,
                buttons: [],
                example_variables: ['Sara', '12345'],
                variable_count: 2,
              },
            ],
          },
        ],
      },
    });

    const presets = await client.templates.presets({
      category: 'utility',
      group: 'commerce',
      language: 'en',
    });

    expect(presets[0]?.key).toBe('order_shipped');
    expect(presets[0]?.variants[0]?.variable_count).toBe(2);
    expect(stub.last().method).toBe('GET');
    expect(stub.last().path).toBe('/api/v1/templates/presets');
    expect(stub.last().query.get('category')).toBe('utility');
    expect(stub.last().query.get('group')).toBe('commerce');
    expect(stub.last().query.get('language')).toBe('en');
  });

  it('createFromPreset returns the template and the submission outcome', async () => {
    const { client, stub } = testClient([
      {
        status: 201,
        body: {
          data: { id: '01HT1', name: 'order_shipped', status: 'pending', preset_key: 'order_shipped' },
          meta: { submission: { submitted: true, error: null } },
        },
      },
      {
        status: 201,
        body: {
          data: { id: '01HT2', name: 'order_shipped_2', status: 'draft' },
          meta: { submission: { submitted: false, error: 'no_template_capable_channel' } },
        },
      },
      {
        status: 201,
        body: { data: { id: '01HT3', name: 'order_shipped_3', status: 'draft' }, meta: { submission: null } },
      },
    ]);

    const ok = await client.templates.createFromPreset('order_shipped', {
      language: 'en',
      channel_id: '01HCH',
      group: 'Orders',
      submit: true,
    });
    expect(stub.last().method).toBe('POST');
    expect(stub.last().path).toBe('/api/v1/templates/presets/order_shipped');
    expect(stub.last().body).toEqual({
      language: 'en',
      channel_id: '01HCH',
      group: 'Orders',
      submit: true,
    });
    expect(ok.template.preset_key).toBe('order_shipped');
    expect(ok.submission).toEqual({ submitted: true, error: null });

    const failed = await client.templates.createFromPreset('order_shipped', { submit: true });
    expect(failed.template.name).toBe('order_shipped_2');
    expect(failed.submission).toEqual({ submitted: false, error: 'no_template_capable_channel' });

    const draft = await client.templates.createFromPreset('order_shipped');
    expect(draft.template.id).toBe('01HT3');
    expect(draft.submission).toBeNull();
  });

  it('createFromPreset rejects an unknown preset with NotFoundError', async () => {
    const { client } = testClient({ status: 404, body: { message: 'preset_not_found' } });

    await expect(client.templates.createFromPreset('no_such_preset')).rejects.toBeInstanceOf(
      NotFoundError,
    );
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
