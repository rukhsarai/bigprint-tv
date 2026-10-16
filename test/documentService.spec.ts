import {createRemoteDocumentService} from '../src/services/documentService';
import type {DocumentListener} from '../src/services/documentService';
import {sampleReceipt} from '../src/data/documents';

type Init = {method?: string};
type Call = {url: string; init?: Init};

/** A fetch that answers from a queue, so each test scripts the backend. */
const makeFetch = (answers: Array<{status?: number; body: unknown}>) => {
  const calls: Call[] = [];
  const impl = jest.fn(async (url: string, init?: Init) => {
    calls.push({url, init});
    const next = answers.shift() ?? {status: 500, body: {ok: false}};
    return {
      ok: (next.status ?? 200) < 400,
      status: next.status ?? 200,
      json: async () => next.body,
    };
  });
  return {impl: impl as unknown as typeof fetch, calls};
};

const listener = (): jest.Mocked<DocumentListener> => ({
  onSession: jest.fn(),
  onProcessing: jest.fn(),
  onDocument: jest.fn(),
  onError: jest.fn(),
});

/** Lets the fetch -> json -> listener promise chain settle under fake timers. */
const flush = async () => {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
};

describe('createRemoteDocumentService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const session = {ok: true, code: '482134', secret: 'abcdefghijklmnopqrstuv', expiresAt: 9999999999};

  it('starts a session and puts the secret only in the QR url', async () => {
    const {impl, calls} = makeFetch([{body: session}]);
    const l = listener();
    const unsubscribe = createRemoteDocumentService('https://x.test/', impl, 1000).subscribe(l);
    await flush();
    expect(calls[0].url).toBe('https://x.test/session');
    expect(calls[0].init?.method).toBe('POST');
    expect(l.onSession).toHaveBeenCalledWith({
      code: '482134',
      captureUrl: 'https://x.test/?c=482134&k=abcdefghijklmnopqrstuv',
      expiresAt: 9999999999,
    });
    unsubscribe();
  });

  it('polls, reports processing once, then delivers the document once', async () => {
    const doc = {...sampleReceipt, id: 'doc-1700000000-abcdefabcdef'};
    const {impl, calls} = makeFetch([
      {body: session},
      {body: {ok: true, state: 'processing'}},
      {body: {ok: true, state: 'processing'}},
      {body: {ok: true, state: 'done', document: doc}},
      {body: {ok: true, state: 'done', document: null}},
    ]);
    const l = listener();
    const unsubscribe = createRemoteDocumentService('https://x.test', impl, 1000).subscribe(l);
    await flush();
    for (let i = 0; i < 4; i++) {
      jest.advanceTimersByTime(1000);
      await flush();
      await flush();
    }
    expect(l.onProcessing).toHaveBeenCalledTimes(1);
    expect(l.onDocument).toHaveBeenCalledTimes(1);
    expect(l.onDocument).toHaveBeenCalledWith(doc);
    // After delivery the TV tells the backend what it has already seen.
    expect(calls[4].url).toContain('since=doc-1700000000-abcdefabcdef');
    unsubscribe();
  });

  it('reports an error when the backend could not read the photo', async () => {
    const {impl} = makeFetch([
      {body: session},
      {body: {ok: true, state: 'error', message: 'Too dark.'}},
    ]);
    const l = listener();
    const unsubscribe = createRemoteDocumentService('https://x.test', impl, 1000).subscribe(l);
    await flush();
    jest.advanceTimersByTime(1000);
    await flush();
    await flush();
    expect(l.onError).toHaveBeenCalledWith('Too dark.');
    unsubscribe();
  });

  it('tells the user when there is no network, and keeps retrying', async () => {
    const impl = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const l = listener();
    const unsubscribe = createRemoteDocumentService('https://x.test', impl, 1000).subscribe(l);
    await flush();
    expect(l.onError).toHaveBeenCalledWith(
      'The TV cannot reach the internet. Please check the connection.',
    );
    jest.advanceTimersByTime(10000);
    await flush();
    expect(impl).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('says the backend refused it when the URL answers 403, not that the network is down', async () => {
    const {impl} = makeFetch([{status: 403, body: {Message: null}}]);
    const l = listener();
    const unsubscribe = createRemoteDocumentService('https://x.test', impl, 1000).subscribe(l);
    await flush();
    await flush();
    expect(l.onError).toHaveBeenCalledWith(
      'The reading service refused this TV (error 403). Please tell the person who set it up.',
    );
    unsubscribe();
  });

  it('shows what the backend said when it refuses to start a session', async () => {
    const {impl} = makeFetch([{status: 503, body: {ok: false, message: 'Busy today.'}}]);
    const l = listener();
    const unsubscribe = createRemoteDocumentService('https://x.test', impl, 1000).subscribe(l);
    await flush();
    await flush();
    expect(l.onError).toHaveBeenCalledWith('Busy today.');
    unsubscribe();
  });

  it('says so when the session expires while a page is being read', async () => {
    const {impl, calls} = makeFetch([
      {body: session},
      {body: {ok: true, state: 'processing'}},
      {status: 410, body: {ok: false}},
      {body: {...session, code: '900002'}},
      {body: {ok: true, state: 'idle'}},
    ]);
    const l = listener();
    const unsubscribe = createRemoteDocumentService('https://x.test', impl, 1000).subscribe(l);
    await flush();
    jest.advanceTimersByTime(1000);
    await flush();
    await flush();
    expect(l.onProcessing).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    await flush();
    await flush();
    await flush();
    expect(calls[3].url).toBe('https://x.test/session');
    expect(l.onSession).toHaveBeenCalledTimes(2);
    // The notice comes after the new code, so the new code does not wipe it.
    const order = l.onSession.mock.invocationCallOrder[1] < l.onError.mock.invocationCallOrder[0];
    expect(order).toBe(true);
    expect(l.onError).toHaveBeenCalledWith(
      'The code expired while a page was being read. Please scan the QR code again and send that page once more.',
    );
    unsubscribe();
  });

  it('tells the user after several failed polls and clears it when polling recovers', async () => {
    let n = 0;
    const impl = jest.fn(async (url: string) => {
      n += 1;
      if (url.endsWith('/session')) {
        return {ok: true, status: 200, json: async () => session};
      }
      if (n <= 6) {
        throw new Error('offline');
      }
      return {ok: true, status: 200, json: async () => ({ok: true, state: 'idle'})};
    }) as unknown as typeof fetch;
    const l = listener();
    const unsubscribe = createRemoteDocumentService('https://x.test', impl, 1000).subscribe(l);
    await flush();
    for (let i = 0; i < 4; i++) {
      jest.advanceTimersByTime(1000);
      await flush();
      await flush();
    }
    expect(l.onError).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    await flush();
    await flush();
    expect(l.onError).toHaveBeenCalledWith(
      'The TV cannot reach the internet. Please check the connection.',
    );
    expect(l.onSession).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    await flush();
    await flush();
    expect(l.onSession).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('starts a new session when the backend has forgotten this one', async () => {
    const {impl, calls} = makeFetch([
      {body: session},
      {status: 410, body: {ok: false, message: 'expired'}},
      {body: {...session, code: '900001'}},
    ]);
    const l = listener();
    const unsubscribe = createRemoteDocumentService('https://x.test', impl, 1000).subscribe(l);
    await flush();
    jest.advanceTimersByTime(1000);
    await flush();
    await flush();
    expect(calls[2].url).toBe('https://x.test/session');
    expect(l.onSession).toHaveBeenLastCalledWith(
      expect.objectContaining({code: '900001'}),
    );
    unsubscribe();
  });

  it('builds an audio url only for lines that have speech', async () => {
    const {impl} = makeFetch([{body: session}]);
    const service = createRemoteDocumentService('https://x.test', impl, 1000);
    const unsubscribe = service.subscribe(listener());
    await flush();
    const doc = {
      ...sampleReceipt,
      id: 'doc-1700000000-abcdefabcdef',
      speech: [{marks: [], durationMs: 0}],
    };
    expect(service.audioUrl(doc, 0)).toBe(
      'https://x.test/audio?c=482134&k=abcdefghijklmnopqrstuv&d=doc-1700000000-abcdefabcdef&n=0',
    );
    expect(service.audioUrl(doc, 1)).toBeNull();
    expect(service.audioUrl(sampleReceipt, 0)).toBeNull();
    unsubscribe();
  });

  it('stops polling after unsubscribe', async () => {
    const {impl} = makeFetch([{body: session}, {body: {ok: true, state: 'idle'}}]);
    const unsubscribe = createRemoteDocumentService('https://x.test', impl, 1000).subscribe(listener());
    await flush();
    unsubscribe();
    jest.advanceTimersByTime(5000);
    await flush();
    expect(impl).toHaveBeenCalledTimes(1);
  });
});

describe('createRemoteDocumentService timeouts and renewal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const session = {ok: true, code: '482134', secret: 'abcdefghijklmnopqrstuv', expiresAt: 9999999999};

  it('reports an error when a reading never finishes', async () => {
    const answers = [{body: session}];
    for (let i = 0; i < 60; i++) {
      answers.push({body: {ok: true, state: 'processing'} as unknown as typeof session});
    }
    const {impl} = makeFetch(answers);
    const l = listener();
    const unsubscribe = createRemoteDocumentService('https://x.test', impl, 1000).subscribe(l);
    await flush();
    const start = Date.now();
    jest.setSystemTime(start);
    for (let i = 0; i < 55; i++) {
      jest.setSystemTime(start + (i + 1) * 3000);
      jest.advanceTimersByTime(1000);
      await flush();
      await flush();
    }
    expect(l.onProcessing).toHaveBeenCalledTimes(1);
    expect(l.onError).toHaveBeenCalledTimes(1);
    expect(l.onError).toHaveBeenCalledWith('That took too long. Please take the photo again.');
    unsubscribe();
  });

  it('keeps audio working for a document after the session is renewed', async () => {
    const doc = {...sampleReceipt, id: 'doc-1700000000-abcdefabcdef', speech: [{marks: [], durationMs: 0}]};
    const {impl} = makeFetch([
      {body: session},
      {body: {ok: true, state: 'done', document: doc}},
      {status: 410, body: {ok: false}},
      {body: {...session, code: '900001', secret: 'zzzzzzzzzzzzzzzzzzzzzz'}},
    ]);
    const service = createRemoteDocumentService('https://x.test', impl, 1000);
    const l = listener();
    const unsubscribe = service.subscribe(l);
    await flush();
    for (let i = 0; i < 3; i++) {
      jest.advanceTimersByTime(1000);
      await flush();
      await flush();
    }
    expect(l.onSession).toHaveBeenLastCalledWith(expect.objectContaining({code: '900001'}));
    expect(service.audioUrl(doc, 0)).toContain('c=482134&k=abcdefghijklmnopqrstuv');
    unsubscribe();
  });
});
