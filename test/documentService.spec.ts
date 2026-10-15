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
