import { describe, expect, it } from 'vitest';
import { HtmlMessageBuilder } from '../src/index.js';
import { testClient } from './helpers.js';

describe('HtmlMessageBuilder', () => {
  it('renders RTL Arabic by default', () => {
    const html = HtmlMessageBuilder.make().heading('مرحباً').toHtml();

    expect(html).toContain('<html dir="rtl" lang="ar">');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('renders LTR English on request', () => {
    expect(HtmlMessageBuilder.make(false).toHtml()).toContain('<html dir="ltr" lang="en">');
  });

  it('keeps blocks in insertion order', () => {
    const html = HtmlMessageBuilder.make()
      .heading('First')
      .paragraph('Second')
      .button('Third', 'https://acme.test')
      .toHtml();

    expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
    expect(html.indexOf('Second')).toBeLessThan(html.indexOf('Third'));
  });

  it('applies styling set after the blocks were added', () => {
    const html = HtmlMessageBuilder.make()
      .button('Go', 'https://acme.test')
      .brandColor('#D6F85C')
      .toHtml();

    expect(html).toContain('#D6F85C');
  });

  it('escapes user text', () => {
    const html = HtmlMessageBuilder.make()
      .heading('<script>alert(1)</script>')
      .paragraph('Tom & Jerry "quoted"')
      .toHtml();

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Tom &amp; Jerry &quot;quoted&quot;');
  });

  it('escapes attribute values so a URL cannot break out', () => {
    const html = HtmlMessageBuilder.make()
      .button('Go', 'https://acme.test/?a=1"onmouseover="alert(1)')
      .toHtml();

    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).toContain('&quot;onmouseover=&quot;');
  });

  it('passes raw html through untouched, as documented', () => {
    const html = HtmlMessageBuilder.make().html('<hr data-x="1">').toHtml();

    expect(html).toContain('<hr data-x="1">');
  });

  it('hides the preheader from the rendered body', () => {
    const html = HtmlMessageBuilder.make().preheader('طلبك في الطريق').toHtml();

    expect(html).toContain('display:none');
    expect(html).toContain('mso-hide:all');
    expect(html).toContain('طلبك في الطريق');
  });

  it('renders logo, divider, spacer, image and footer', () => {
    const html = HtmlMessageBuilder.make()
      .logo('https://cdn.test/logo.png', 90)
      .divider()
      .spacer(24)
      .image('https://cdn.test/hero.jpg', 'Hero')
      .footer('© 2026 Acme')
      .toHtml();

    expect(html).toContain('src="https://cdn.test/logo.png"');
    expect(html).toContain('width="90"');
    expect(html).toContain('border-top:1px solid #e2e8f0');
    expect(html).toContain('height:24px');
    expect(html).toContain('alt="Hero"');
    expect(html).toContain('© 2026 Acme');
  });

  it('omits optional chrome when it was never set', () => {
    const html = HtmlMessageBuilder.make().paragraph('Body only').toHtml();

    expect(html).not.toContain('<img');
    expect(html).not.toContain('mso-hide:all');
  });

  it('stringifies to its markup', () => {
    const builder = HtmlMessageBuilder.make().heading('Hi');

    expect(`${builder}`).toBe(builder.toHtml());
  });

  it('is accepted directly by emails.sendHtml', async () => {
    const { client, stub } = testClient({ body: { data: {} } });
    const message = HtmlMessageBuilder.make().heading('شكراً لطلبك!');

    await client.emails.sendHtml('Acme <a@b.c>', 'ali@example.com', 'طلبك', message);

    const body = stub.last().body as { html: string };
    expect(body.html).toContain('شكراً لطلبك!');
    expect(body.html.startsWith('<!DOCTYPE html>')).toBe(true);
  });
});
