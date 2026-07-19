import { resolveOutcome } from '../../intercept/resolveOutcome';
import { addTrustedAddress, getTrustedAddresses } from '../../utils/storageHelper';

// Mock chrome.storage
global.chrome = {
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        const result: any = {};
        if (keys.includes('trustedAddresses')) {
          result['trustedAddresses'] = [];
        }
        callback(result);
      }),
      set: jest.fn((obj, cb) => cb && cb()),
    },
  },
} as any;

describe('resolveOutcome', () => {
  const deps = {
    extractDestination: (xdr: string) => ({ destination: '0xABC', asset: undefined }),
    getScore: jest.fn().mockResolvedValue(42),
    requestDecision: jest.fn().mockResolvedValue('proceed' as any),
  };

  beforeEach(() => {
    // reset mocks
    (global.chrome.storage.local.get as jest.Mock).mockClear();
    (global.chrome.storage.local.set as jest.Mock).mockClear();
    deps.getScore.mockClear();
    deps.requestDecision.mockClear();
  });

  it('should allow when destination is trusted', async () => {
    // Add trusted address
    await addTrustedAddress('0xABC');
    const outcome = await resolveOutcome('dummyXDR', deps);
    expect(outcome).toBe('allow');
    expect(deps.requestDecision).not.toHaveBeenCalled();
  });

  it('should request decision when destination is not trusted', async () => {
    const outcome = await resolveOutcome('dummyXDR', deps);
    expect(outcome).toBe('proceed'); // depends on mock
    expect(deps.requestDecision).toHaveBeenCalledWith({
      destination: '0xABC',
      asset: undefined,
      score: 42,
    });
  });
});
