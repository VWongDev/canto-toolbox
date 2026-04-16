import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageManager, MessageManager } from '../background';

vi.mock('../../utils/dictionary.js', () => ({
  lookupWord: vi.fn().mockReturnValue({
    word: '好',
    mandarin: { entries: [{ traditional: '好', simplified: '好', romanisation: 'hao3', definitions: ['good'] }] },
    cantonese: { entries: [] },
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeSyncStorage = () => ({
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
} as unknown as chrome.storage.StorageArea);

const makeLocalStorage = () => ({
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
} as unknown as chrome.storage.StorageArea);

type MockRuntime = {
  onMessage: { addListener: ReturnType<typeof vi.fn> };
  sendMessage: ReturnType<typeof vi.fn>;
  lastError: chrome.runtime.LastError | null;
};

const makeMockRuntime = (): MockRuntime => ({
  onMessage: { addListener: vi.fn() },
  sendMessage: vi.fn(),
  lastError: null,
});

// ---------------------------------------------------------------------------
// StorageManager
// ---------------------------------------------------------------------------

describe('StorageManager', () => {
  describe('getStatistics', () => {
    it('returns empty object when both storages are empty', async () => {
      const manager = new StorageManager(makeSyncStorage(), makeLocalStorage());
      expect(await manager.getStatistics()).toEqual({});
    });

    it('returns sync-only stats when local storage is empty', async () => {
      const sync = makeSyncStorage();
      vi.mocked(sync.get).mockResolvedValue({
        wordStatistics: { 好: { count: 3, firstSeen: 100, lastSeen: 200 } },
      });
      const manager = new StorageManager(sync, makeLocalStorage());
      const stats = await manager.getStatistics();
      expect(stats['好'].count).toBe(3);
    });

    it('returns local-only stats when sync storage is empty', async () => {
      const local = makeLocalStorage();
      vi.mocked(local.get).mockResolvedValue({
        wordStatistics: { 字: { count: 1, firstSeen: 50, lastSeen: 150 } },
      });
      const manager = new StorageManager(makeSyncStorage(), local);
      const stats = await manager.getStatistics();
      expect(stats['字'].count).toBe(1);
    });

    it('merges counts for a word present in both storages', async () => {
      const sync = makeSyncStorage();
      const local = makeLocalStorage();
      vi.mocked(sync.get).mockResolvedValue({
        wordStatistics: { 好: { count: 3, firstSeen: 100, lastSeen: 200 } },
      });
      vi.mocked(local.get).mockResolvedValue({
        wordStatistics: { 好: { count: 2, firstSeen: 50, lastSeen: 150 } },
      });
      const manager = new StorageManager(sync, local);
      const stats = await manager.getStatistics();
      expect(stats['好'].count).toBe(5);
    });

    it('takes the earliest firstSeen when merging', async () => {
      const sync = makeSyncStorage();
      const local = makeLocalStorage();
      vi.mocked(sync.get).mockResolvedValue({
        wordStatistics: { 好: { count: 1, firstSeen: 200, lastSeen: 200 } },
      });
      vi.mocked(local.get).mockResolvedValue({
        wordStatistics: { 好: { count: 1, firstSeen: 50, lastSeen: 100 } },
      });
      const manager = new StorageManager(sync, local);
      const stats = await manager.getStatistics();
      expect(stats['好'].firstSeen).toBe(50);
    });

    it('takes the latest lastSeen when merging', async () => {
      const sync = makeSyncStorage();
      const local = makeLocalStorage();
      vi.mocked(sync.get).mockResolvedValue({
        wordStatistics: { 好: { count: 1, firstSeen: 100, lastSeen: 300 } },
      });
      vi.mocked(local.get).mockResolvedValue({
        wordStatistics: { 好: { count: 1, firstSeen: 100, lastSeen: 100 } },
      });
      const manager = new StorageManager(sync, local);
      const stats = await manager.getStatistics();
      expect(stats['好'].lastSeen).toBe(300);
    });

    it('handles storage read errors gracefully', async () => {
      const sync = makeSyncStorage();
      vi.mocked(sync.get).mockRejectedValue(new Error('QuotaExceededError'));
      const manager = new StorageManager(sync, makeLocalStorage());
      const stats = await manager.getStatistics();
      expect(stats).toEqual({});
    });
  });

  describe('updateStatistics', () => {
    it('does not throw for a valid word', () => {
      const manager = new StorageManager(makeSyncStorage(), makeLocalStorage());
      expect(() => manager.updateStatistics('好')).not.toThrow();
    });

    it('ignores empty strings', () => {
      const sync = makeSyncStorage();
      const manager = new StorageManager(sync, makeLocalStorage());
      manager.updateStatistics('');
      // no write should be enqueued for blank input
      expect(sync.set).not.toHaveBeenCalled();
    });

    it('ignores whitespace-only strings', () => {
      const sync = makeSyncStorage();
      const manager = new StorageManager(sync, makeLocalStorage());
      manager.updateStatistics('   ');
      expect(sync.set).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// MessageManager
// ---------------------------------------------------------------------------

describe('MessageManager', () => {
  let runtime: MockRuntime;
  let manager: MessageManager;

  beforeEach(() => {
    runtime = makeMockRuntime();
    manager = new MessageManager(
      runtime as unknown as typeof chrome.runtime,
      new StorageManager(makeSyncStorage(), makeLocalStorage()),
    );
  });

  describe('init', () => {
    it('registers exactly one onMessage listener', () => {
      manager.init();
      expect(runtime.onMessage.addListener).toHaveBeenCalledOnce();
    });
  });

  describe('lookupWord (client side)', () => {
    it('sends a lookup_word message', () => {
      manager.lookupWord('好', vi.fn());
      expect(runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'lookup_word', word: '好' },
        expect.any(Function),
      );
    });

    it('invokes callback with the definition on success', () => {
      const cb = vi.fn();
      manager.lookupWord('好', cb);
      const reply = vi.mocked(runtime.sendMessage).mock.calls[0][1] as (r: unknown) => void;
      reply({ success: true, definition: { word: '好', mandarin: { entries: [] }, cantonese: { entries: [] } } });
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('invokes callback with error on failed response', () => {
      const cb = vi.fn();
      manager.lookupWord('好', cb);
      const reply = vi.mocked(runtime.sendMessage).mock.calls[0][1] as (r: unknown) => void;
      reply({ success: false, error: 'not found' });
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });

  describe('trackWord (client side)', () => {
    it('sends a track_word message', () => {
      manager.trackWord('好', vi.fn());
      expect(runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'track_word', word: '好' },
        expect.any(Function),
      );
    });

    it('invokes callback with success on successful response', () => {
      const cb = vi.fn();
      manager.trackWord('好', cb);
      const reply = vi.mocked(runtime.sendMessage).mock.calls[0][1] as (r: unknown) => void;
      reply({ success: true });
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('getStatistics (client side)', () => {
    it('sends a get_statistics message', () => {
      manager.getStatistics(vi.fn());
      expect(runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'get_statistics' },
        expect.any(Function),
      );
    });

    it('invokes callback with statistics on success', () => {
      const cb = vi.fn();
      manager.getStatistics(cb);
      const reply = vi.mocked(runtime.sendMessage).mock.calls[0][1] as (r: unknown) => void;
      reply({ success: true, statistics: { 好: { count: 1, firstSeen: 0, lastSeen: 0 } } });
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true, statistics: expect.any(Object) }));
    });

    it('invokes callback with error on failed response', () => {
      const cb = vi.fn();
      manager.getStatistics(cb);
      const reply = vi.mocked(runtime.sendMessage).mock.calls[0][1] as (r: unknown) => void;
      reply({ success: false, error: 'storage error' });
      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });

  describe('message handler (server side via init)', () => {
    it('handles lookup_word and returns a definition', () => {
      manager.init();
      const handler = vi.mocked(runtime.onMessage.addListener).mock.calls[0][0] as (
        msg: unknown, sender: unknown, sendResponse: (r: unknown) => void,
      ) => boolean;

      const sendResponse = vi.fn();
      handler({ type: 'lookup_word', word: '好' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('handles track_word and returns success', () => {
      manager.init();
      const handler = vi.mocked(runtime.onMessage.addListener).mock.calls[0][0] as (
        msg: unknown, sender: unknown, sendResponse: (r: unknown) => void,
      ) => boolean;

      const sendResponse = vi.fn();
      handler({ type: 'track_word', word: '好' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns true for known message types to keep the channel open', () => {
      manager.init();
      const handler = vi.mocked(runtime.onMessage.addListener).mock.calls[0][0] as (
        msg: unknown, sender: unknown, sendResponse: (r: unknown) => void,
      ) => boolean;

      expect(handler({ type: 'lookup_word', word: '好' }, {}, vi.fn())).toBe(true);
      expect(handler({ type: 'track_word', word: '好' }, {}, vi.fn())).toBe(true);
      expect(handler({ type: 'get_statistics' }, {}, vi.fn())).toBe(true);
    });

    it('returns false for unknown message types', () => {
      manager.init();
      const handler = vi.mocked(runtime.onMessage.addListener).mock.calls[0][0] as (
        msg: unknown, sender: unknown, sendResponse: (r: unknown) => void,
      ) => boolean;

      expect(handler({ type: 'unknown_type' }, {}, vi.fn())).toBe(false);
    });
  });
});
