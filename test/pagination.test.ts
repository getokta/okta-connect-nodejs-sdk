import { describe, expect, it } from 'vitest';
import { Page } from '../src/index.js';
import { paginated, stubFetch, testClient } from './helpers.js';

describe('Page', () => {
  it('exposes data, meta and links, and is iterable', () => {
    const page = new Page<{ id: string }>(paginated([{ id: 'a' }, { id: 'b' }]));

    expect(page.length).toBe(2);
    expect(page.total).toBe(2);
    expect(page.currentPage).toBe(1);
    expect([...page].map((item) => item.id)).toEqual(['a', 'b']);
    expect(page.first()?.id).toBe('a');
  });

  it('tolerates an empty or malformed payload', () => {
    expect(new Page(undefined).data).toEqual([]);
    expect(new Page({}).length).toBe(0);
    expect(new Page({ data: undefined }).hasMore).toBe(false);
  });

  it('reports hasMore from the page counters', () => {
    const more = new Page(paginated([{ id: 'a' }], { current_page: 1, last_page: 3 }));
    const last = new Page(paginated([{ id: 'a' }], { current_page: 3, last_page: 3 }));

    expect(more.hasMore).toBe(true);
    expect(more.nextPage).toBe(2);
    expect(last.hasMore).toBe(false);
    expect(last.nextPage).toBeUndefined();
  });

  it('reports hasMore from a next link when counters are absent', () => {
    const page = new Page({ data: [], links: { next: 'https://connect.test/x?page=2' } });

    expect(page.hasMore).toBe(true);
  });
});

describe('listAll', () => {
  it('walks every page and yields each item once', async () => {
    const stub = stubFetch([
      { body: paginated([{ id: 'a' }, { id: 'b' }], { current_page: 1, last_page: 2, total: 3 }) },
      { body: paginated([{ id: 'c' }], { current_page: 2, last_page: 2, total: 3 }) },
    ]);
    const { client } = testClient([], { fetch: stub.fetch });

    const ids: string[] = [];

    for await (const contact of client.contacts.listAll({ per_page: 2 })) {
      ids.push(contact.id);
    }

    expect(ids).toEqual(['a', 'b', 'c']);
    expect(stub.callCount()).toBe(2);
    expect(stub.requests[0]?.query.get('page')).toBe('1');
    expect(stub.requests[1]?.query.get('page')).toBe('2');
    expect(stub.requests[0]?.query.get('per_page')).toBe('2');
  });

  it('stops early when the caller breaks out', async () => {
    const stub = stubFetch({
      body: paginated([{ id: 'a' }], { current_page: 1, last_page: 99 }),
    });
    const { client } = testClient([], { fetch: stub.fetch });

    for await (const _contact of client.contacts.listAll()) {
      break;
    }

    expect(stub.callCount()).toBe(1);
  });

  it('does not loop forever when a paginator claims more but returns none', async () => {
    const stub = stubFetch({ body: paginated([], { current_page: 1, last_page: 5 }) });
    const { client } = testClient([], { fetch: stub.fetch });

    const collected = [];

    for await (const contact of client.contacts.listAll()) {
      collected.push(contact);
    }

    expect(collected).toEqual([]);
    expect(stub.callCount()).toBe(1);
  });

  it('paginates conversation messages too', async () => {
    const stub = stubFetch([
      { body: paginated([{ id: 'm1' }], { current_page: 1, last_page: 2 }) },
      { body: paginated([{ id: 'm2' }], { current_page: 2, last_page: 2 }) },
    ]);
    const { client } = testClient([], { fetch: stub.fetch });

    const ids: string[] = [];

    for await (const message of client.messages.listAll({ conversation_id: '01HCONV' })) {
      ids.push(message.id);
    }

    expect(ids).toEqual(['m1', 'm2']);
    expect(stub.requests[0]?.path).toBe('/api/v1/conversations/01HCONV/messages');
  });
});
