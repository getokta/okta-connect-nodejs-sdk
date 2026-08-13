const FONT_STACK = "'Segoe UI',Tahoma,Helvetica,Arial,sans-serif";

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'button'; label: string; url: string }
  | { kind: 'divider' }
  | { kind: 'spacer'; px: number }
  | { kind: 'image'; url: string; alt: string }
  | { kind: 'html'; raw: string };

/**
 * Fluent builder for email-client-safe HTML.
 *
 * Emits a complete document with a table-based layout, every style inlined and
 * a 600px centred card — the lowest common denominator that renders correctly
 * in Gmail and Outlook. It exists so callers can design a branded message
 * without hand-writing 2003-era email markup.
 *
 * RTL-first, matching the platform's Arabic default: `make()` produces
 * `dir="rtl" lang="ar"`; pass `false` for LTR.
 *
 * ```ts
 * const message = HtmlMessageBuilder.make()
 *   .brandColor('#D6F85C')
 *   .logo('https://cdn.acme.com/logo.png')
 *   .preheader('طلبك في الطريق')
 *   .heading('شكراً لطلبك!')
 *   .paragraph('طلبك رقم 1042 قيد التجهيز الآن.')
 *   .button('تتبع الطلب', 'https://acme.com/orders/1042')
 *   .divider()
 *   .footer('© 2026 Acme');
 *
 * await client.emails.sendHtml(from, 'ali@example.com', 'طلبك رقم 1042', message);
 * ```
 *
 * Every text input is HTML-escaped. {@link html} is the sole escape hatch —
 * never pass untrusted input to it.
 */
export class HtmlMessageBuilder {
  private brand = '#10b981';
  private background = '#f8fafc';
  private logoUrl: string | null = null;
  private logoWidth = 120;
  private preheaderText: string | null = null;
  private footerText: string | null = null;
  private readonly blocks: Block[] = [];

  private constructor(private readonly rtl: boolean) {}

  /** Start a message. RTL by default; pass `false` for a left-to-right document. */
  static make(rtl = true): HtmlMessageBuilder {
    return new HtmlMessageBuilder(rtl);
  }

  /** Accent colour for buttons, as hex. */
  brandColor(hex: string): this {
    this.brand = hex;

    return this;
  }

  /** Page background behind the white card, as hex. */
  backgroundColor(hex: string): this {
    this.background = hex;

    return this;
  }

  /** Brand logo, centred at the top of the card. */
  logo(url: string, width = 120): this {
    this.logoUrl = url;
    this.logoWidth = width;

    return this;
  }

  /**
   * Hidden preview text shown next to the subject in inbox lists, and never
   * visible in the opened message.
   */
  preheader(text: string): this {
    this.preheaderText = text;

    return this;
  }

  heading(text: string): this {
    this.blocks.push({ kind: 'heading', text });

    return this;
  }

  paragraph(text: string): this {
    this.blocks.push({ kind: 'paragraph', text });

    return this;
  }

  /**
   * Solid brand-colour pill button — a bulletproof `<a>` with inline padding,
   * so its whole face stays clickable in Outlook.
   */
  button(label: string, url: string): this {
    this.blocks.push({ kind: 'button', label, url });

    return this;
  }

  divider(): this {
    this.blocks.push({ kind: 'divider' });

    return this;
  }

  spacer(px = 16): this {
    this.blocks.push({ kind: 'spacer', px });

    return this;
  }

  image(url: string, alt = ''): this {
    this.blocks.push({ kind: 'image', url, alt });

    return this;
  }

  /**
   * Append a raw, pre-built HTML block verbatim — the only input that bypasses
   * escaping.
   */
  html(rawBlock: string): this {
    this.blocks.push({ kind: 'html', raw: rawBlock });

    return this;
  }

  /** Muted small print below the card: address, unsubscribe hints, copyright. */
  footer(text: string): this {
    this.footerText = text;

    return this;
  }

  /** Render the complete `<!DOCTYPE html>` document. */
  toHtml(): string {
    const dir = this.rtl ? 'rtl' : 'ltr';
    const lang = this.rtl ? 'ar' : 'en';
    const align = this.rtl ? 'right' : 'left';
    const background = escapeHtml(this.background);

    const lines: string[] = [
      '<!DOCTYPE html>',
      `<html dir="${dir}" lang="${lang}">`,
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
      '<title></title>',
      '</head>',
      `<body style="margin:0;padding:0;word-spacing:normal;background-color:${background};">`,
    ];

    if (this.preheaderText !== null) {
      lines.push(
        `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(
          this.preheaderText,
        )}${'&nbsp;&zwnj;'.repeat(20)}</div>`,
      );
    }

    lines.push(
      `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:${background};">`,
      '<tr>',
      '<td align="center" style="padding:24px 12px;">',
      '<table role="presentation" width="600" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:8px;">',
    );

    if (this.logoUrl !== null) {
      lines.push(
        '<tr>',
        '<td align="center" style="padding:32px 32px 0;">',
        `<img src="${escapeHtml(this.logoUrl)}" alt="" width="${this.logoWidth}" style="display:block;border:0;max-width:100%;height:auto;">`,
        '</td>',
        '</tr>',
      );
    }

    lines.push(
      '<tr>',
      `<td dir="${dir}" style="padding:32px;font-family:${FONT_STACK};text-align:${align};">`,
    );

    for (const block of this.blocks) {
      lines.push(this.renderBlock(block, align));
    }

    lines.push('</td>', '</tr>', '</table>');

    if (this.footerText !== null) {
      lines.push(
        '<table role="presentation" width="600" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">',
        '<tr>',
        `<td dir="${dir}" align="center" style="padding:24px 32px 0;font-family:${FONT_STACK};font-size:12px;line-height:18px;color:#94a3b8;text-align:center;">${escapeHtml(
          this.footerText,
        )}</td>`,
        '</tr>',
        '</table>',
      );
    }

    lines.push('</td>', '</tr>', '</table>', '</body>', '</html>');

    return lines.join('\n');
  }

  /** Alias for {@link toHtml}, so the builder can be used as a string. */
  toString(): string {
    return this.toHtml();
  }

  private renderBlock(block: Block, align: string): string {
    const brand = escapeHtml(this.brand);

    switch (block.kind) {
      case 'heading':
        return `<h1 style="margin:0 0 16px;font-family:${FONT_STACK};font-size:24px;line-height:32px;font-weight:bold;color:#0f172a;">${escapeHtml(block.text)}</h1>`;

      case 'paragraph':
        return `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:16px;line-height:26px;color:#334155;">${escapeHtml(block.text)}</p>`;

      case 'button':
        return (
          '<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">' +
          `<tr><td align="${align}">` +
          '<table role="presentation" border="0" cellpadding="0" cellspacing="0">' +
          `<tr><td align="center" bgcolor="${brand}" style="border-radius:9999px;background-color:${brand};">` +
          `<a href="${escapeHtml(block.url)}" target="_blank" style="display:inline-block;padding:12px 32px;font-family:${FONT_STACK};font-size:16px;font-weight:bold;line-height:20px;color:#ffffff;text-decoration:none;border-radius:9999px;">${escapeHtml(block.label)}</a>` +
          '</td></tr>' +
          '</table>' +
          '</td></tr>' +
          '</table>'
        );

      case 'divider':
        return (
          '<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:16px 0;">' +
          '<tr><td style="border-top:1px solid #e2e8f0;font-size:1px;line-height:1px;">&nbsp;</td></tr>' +
          '</table>'
        );

      case 'spacer':
        return `<div style="height:${block.px}px;line-height:${block.px}px;font-size:1px;">&nbsp;</div>`;

      case 'image':
        return `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:6px;margin:0 0 16px;">`;

      case 'html':
        return block.raw;
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
