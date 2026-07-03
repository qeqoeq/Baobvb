import { vi, describe, it, expect, beforeEach } from 'vitest';

// push-notifications.ts imports native modules that rolldown cannot parse.
// Mock all of them before the module is loaded.
vi.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: vi.fn(),
  getLastNotificationResponseAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  setNotificationHandler: vi.fn(),
}));
vi.mock('expo-constants', () => ({ default: { easConfig: null, expoConfig: null } }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('./supabase-auth', () => ({ getAuthenticatedUserId: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));

// Must import after vi.mock is hoisted.
import * as Notifications from 'expo-notifications';
import {
  extractPassDeliveryFromNotificationData,
  addPassDeliveryNotificationResponseListener,
  getLaunchPassDeliveryFromLastNotification,
} from './push-notifications';

const mockAddListener = Notifications.addNotificationResponseReceivedListener as ReturnType<typeof vi.fn>;
const mockGetLast = Notifications.getLastNotificationResponseAsync as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

function fakeResponse(data: unknown) {
  return { notification: { request: { content: { data } } } };
}

// ── extractPassDeliveryFromNotificationData ───────────────────────────────────

describe('extractPassDeliveryFromNotificationData', () => {
  it('returns true for type pass_delivery', () => {
    expect(extractPassDeliveryFromNotificationData({ type: 'pass_delivery' })).toBe(true);
  });

  it('returns false for type reveal_ready', () => {
    expect(extractPassDeliveryFromNotificationData({ type: 'reveal_ready' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(extractPassDeliveryFromNotificationData(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(extractPassDeliveryFromNotificationData(undefined)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(extractPassDeliveryFromNotificationData({})).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(extractPassDeliveryFromNotificationData('pass_delivery')).toBe(false);
  });
});

// ── addPassDeliveryNotificationResponseListener ───────────────────────────────

describe('addPassDeliveryNotificationResponseListener', () => {
  it('N1: callback fired once when notification type is pass_delivery', () => {
    let capturedHandler: ((r: unknown) => void) | null = null;
    mockAddListener.mockImplementation((handler) => {
      capturedHandler = handler;
      return { remove: vi.fn() };
    });

    const onPass = vi.fn();
    addPassDeliveryNotificationResponseListener(onPass);

    capturedHandler!(fakeResponse({ type: 'pass_delivery' }));
    expect(onPass).toHaveBeenCalledOnce();
  });

  it('N2: callback NOT fired for reveal_ready notification', () => {
    let capturedHandler: ((r: unknown) => void) | null = null;
    mockAddListener.mockImplementation((handler) => {
      capturedHandler = handler;
      return { remove: vi.fn() };
    });

    const onPass = vi.fn();
    addPassDeliveryNotificationResponseListener(onPass);

    capturedHandler!(fakeResponse({ type: 'reveal_ready', relationId: 'some-uuid' }));
    expect(onPass).not.toHaveBeenCalled();
  });

  it('N3: callback NOT fired when notification data is null', () => {
    let capturedHandler: ((r: unknown) => void) | null = null;
    mockAddListener.mockImplementation((handler) => {
      capturedHandler = handler;
      return { remove: vi.fn() };
    });

    const onPass = vi.fn();
    addPassDeliveryNotificationResponseListener(onPass);

    capturedHandler!(fakeResponse(null));
    expect(onPass).not.toHaveBeenCalled();
  });

  it('N4: returned cleanup function calls sub.remove()', () => {
    const mockRemove = vi.fn();
    mockAddListener.mockReturnValueOnce({ remove: mockRemove });

    const remove = addPassDeliveryNotificationResponseListener(vi.fn());
    remove();

    expect(mockRemove).toHaveBeenCalledOnce();
  });
});

// ── getLaunchPassDeliveryFromLastNotification ─────────────────────────────────

describe('getLaunchPassDeliveryFromLastNotification', () => {
  it('N5: returns true when last notification is pass_delivery (cold-start)', async () => {
    mockGetLast.mockResolvedValueOnce(fakeResponse({ type: 'pass_delivery' }));
    expect(await getLaunchPassDeliveryFromLastNotification()).toBe(true);
  });

  it('N6: returns false when last notification is reveal_ready', async () => {
    mockGetLast.mockResolvedValueOnce(fakeResponse({ type: 'reveal_ready' }));
    expect(await getLaunchPassDeliveryFromLastNotification()).toBe(false);
  });

  it('N7: returns false when there is no last notification', async () => {
    mockGetLast.mockResolvedValueOnce(null);
    expect(await getLaunchPassDeliveryFromLastNotification()).toBe(false);
  });
});
