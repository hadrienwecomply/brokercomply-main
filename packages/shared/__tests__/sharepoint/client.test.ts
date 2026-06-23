import { beforeEach, describe, expect, it } from 'vitest';
import { SharePointClient, type RangePut } from '../../src/sharepoint/client.js';
import type { GraphTransport } from '../../src/sharepoint/types.js';

/** A Graph error carrying a statusCode, like the real SDK throws. */
class GraphError extends Error {
  constructor(
    public statusCode: number,
    message = `HTTP ${statusCode}`,
  ) {
    super(message);
  }
}

type Method = 'get' | 'post' | 'put';
interface Handler {
  method: Method;
  match: (url: string) => boolean;
  respond: (url: string, body?: unknown) => unknown;
}

/** Scriptable fake transport: register handlers, records every call. */
class FakeTransport implements GraphTransport {
  calls: Array<{ method: Method; url: string; body?: unknown; contentType?: string }> = [];
  private handlers: Handler[] = [];

  on(method: Method, match: (url: string) => boolean, respond: Handler['respond']): this {
    this.handlers.push({ method, match, respond });
    return this;
  }

  private handle(method: Method, url: string, body?: unknown): unknown {
    const h = this.handlers.find((x) => x.method === method && x.match(url));
    if (!h) throw new GraphError(599, `unhandled ${method} ${url}`);
    const r = h.respond(url, body);
    if (r instanceof GraphError) throw r;
    return r;
  }

  async get<T>(url: string): Promise<T> {
    this.calls.push({ method: 'get', url });
    return this.handle('get', url) as T;
  }
  async post<T>(url: string, body: unknown): Promise<T> {
    this.calls.push({ method: 'post', url, body });
    return this.handle('post', url, body) as T;
  }
  async put<T>(url: string, body: Buffer, contentType: string): Promise<T> {
    this.calls.push({ method: 'put', url, body, contentType });
    return this.handle('put', url, body) as T;
  }
}

const SITE = 'site-1';
const DRIVE = 'drive-1';
const ROOT = '01 - Clients';

function withDrive(t: FakeTransport): FakeTransport {
  return t.on(
    'get',
    (u) => u.includes(`/sites/${SITE}/drive?`),
    () => ({ id: DRIVE }),
  );
}

function makeClient(t: FakeTransport, opts: { rangePut?: RangePut } = {}): SharePointClient {
  return new SharePointClient(t, { siteId: SITE, rootPath: ROOT }, opts);
}

describe('SharePointClient.ensureBrokerFolder', () => {
  let t: FakeTransport;
  beforeEach(() => {
    t = withDrive(new FakeTransport());
  });

  it('links an existing folder without creating (no POST, no dup)', async () => {
    t.on(
      'get',
      (u) => u.includes('/root:/01%20-%20Clients/Acme'),
      () => ({
        id: 'f1',
        name: 'Acme',
        webUrl: 'https://sp/Acme',
        folder: {},
      }),
    );
    const ref = await makeClient(t).ensureBrokerFolder('Acme');
    expect(ref).toMatchObject({ id: 'f1', created: false, path: '01 - Clients/Acme' });
    expect(t.calls.some((c) => c.method === 'post')).toBe(false);
  });

  it('creates the folder with conflictBehavior:fail when absent', async () => {
    t.on(
      'get',
      (u) => u.includes('/root:/01%20-%20Clients/Acme'),
      () => new GraphError(404),
    );
    t.on(
      'post',
      (u) => u.includes('/root:/01%20-%20Clients:/children'),
      (_u, body) => {
        expect(body).toMatchObject({
          name: 'Acme',
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        });
        return { id: 'f2', name: 'Acme', webUrl: 'https://sp/Acme' };
      },
    );
    const ref = await makeClient(t).ensureBrokerFolder('Acme');
    expect(ref).toMatchObject({ id: 'f2', created: true });
  });

  it('never issues a delete', async () => {
    // FakeTransport has no delete method at all — assert the type/contract:
    expect((t as unknown as Record<string, unknown>).delete).toBeUndefined();
  });

  it('rejects an empty folder name', async () => {
    await expect(makeClient(t).ensureBrokerFolder('   ')).rejects.toThrow(/required/);
  });
});

describe('SharePointClient.resolveFolderByPath', () => {
  it('returns null on 404 and on non-folder items', async () => {
    const t = withDrive(new FakeTransport())
      .on(
        'get',
        (u) => u.includes('/root:/missing'),
        () => new GraphError(404),
      )
      .on(
        'get',
        (u) => u.includes('/root:/afile'),
        () => ({ id: 'x', name: 'afile', file: {} }),
      );
    const c = makeClient(t);
    expect(await c.resolveFolderByPath('missing')).toBeNull();
    expect(await c.resolveFolderByPath('afile')).toBeNull();
  });

  it('resolves an existing folder', async () => {
    const t = withDrive(new FakeTransport()).on(
      'get',
      (u) => u.includes('/root:/01%20-%20Clients/Elite'),
      () => ({ id: 'e1', name: 'Elite', webUrl: 'https://sp/Elite', folder: {} }),
    );
    const ref = await makeClient(t).resolveFolderByPath('01 - Clients/Elite');
    expect(ref).toMatchObject({ id: 'e1', name: 'Elite', created: false });
  });
});

describe('SharePointClient.listFolderChildren', () => {
  it('follows @odata.nextLink pagination', async () => {
    const t = withDrive(new FakeTransport())
      .on(
        'get',
        (u) => u.includes('/items/f1/children'),
        () => ({
          value: [{ id: 'a' }],
          '@odata.nextLink': 'https://graph/next-page',
        }),
      )
      .on(
        'get',
        (u) => u.startsWith('https://graph/next-page'),
        () => ({ value: [{ id: 'b' }] }),
      );
    const items = await makeClient(t).listFolderChildren('f1');
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('SharePointClient.uploadFile', () => {
  it('uses a simple PUT for small files', async () => {
    const t = withDrive(new FakeTransport()).on(
      'put',
      (u) => u.includes('/items/f1:/report.pdf:/content'),
      () => ({ id: 'u1', name: 'report.pdf' }),
    );
    const item = await makeClient(t).uploadFile(
      'f1',
      'report.pdf',
      Buffer.from('hello'),
      'application/pdf',
    );
    expect(item.id).toBe('u1');
    const put = t.calls.find((c) => c.method === 'put');
    expect(put?.contentType).toBe('application/pdf');
  });

  it('uses a chunked upload session for large files', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024); // 6 MiB → 5 MiB + 1 MiB
    const ranges: string[] = [];
    const rangePut: RangePut = async (_url, chunk, headers) => {
      ranges.push(headers['Content-Range']);
      expect(headers['Content-Length']).toBe(String(chunk.byteLength));
      const [, , end, total] = /bytes (\d+)-(\d+)\/(\d+)/.exec(headers['Content-Range'])!;
      const final = Number(end) + 1 === Number(total);
      return final ? { status: 201, item: { id: 'big', name: 'big.bin' } } : { status: 202 };
    };
    const t = withDrive(new FakeTransport()).on(
      'post',
      (u) => u.includes('/items/f1:/big.bin:/createUploadSession'),
      () => ({ uploadUrl: 'https://upload/session' }),
    );
    const item = await makeClient(t, { rangePut }).uploadFile('f1', 'big.bin', big);
    expect(item.id).toBe('big');
    expect(ranges).toEqual([
      `bytes 0-${5 * 1024 * 1024 - 1}/${6 * 1024 * 1024}`,
      `bytes ${5 * 1024 * 1024}-${6 * 1024 * 1024 - 1}/${6 * 1024 * 1024}`,
    ]);
  });
});

describe('SharePointClient.syncFolderDelta', () => {
  it('scopes the delta to the broker folder and follows nextLink pages', async () => {
    const t = withDrive(new FakeTransport())
      .on(
        'get',
        (u) => u.endsWith('/items/folder-x/delta'),
        () => ({
          value: [{ id: 'i1' }],
          '@odata.nextLink': 'https://graph/delta-2',
        }),
      )
      .on(
        'get',
        (u) => u.startsWith('https://graph/delta-2'),
        () => ({
          value: [{ id: 'i2' }],
          '@odata.deltaLink': 'https://graph/token-1',
        }),
      );
    const res = await makeClient(t).syncFolderDelta('folder-x');
    expect(res.items.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(res.deltaLink).toBe('https://graph/token-1');
  });

  it('falls back to a full folder resync when the delta token is expired (410)', async () => {
    const t = withDrive(new FakeTransport())
      .on(
        'get',
        (u) => u.startsWith('https://graph/old-token'),
        () => new GraphError(410),
      )
      .on(
        'get',
        (u) => u.endsWith('/items/folder-x/delta'),
        () => ({
          value: [{ id: 'i1' }],
          '@odata.deltaLink': 'https://graph/token-2',
        }),
      );
    const res = await makeClient(t).syncFolderDelta('folder-x', 'https://graph/old-token');
    expect(res.items.map((i) => i.id)).toEqual(['i1']);
    expect(res.deltaLink).toBe('https://graph/token-2');
  });
});
