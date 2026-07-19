/* src/utils/storageHelper.ts */
/**
 * Helper functions for managing a trusted address allowlist using chrome.storage.
 * Uses chrome.storage.local to persist data per device.
 */

export interface TrustedAddressStore {
  trustedAddresses: string[];
}

const STORE_KEY = 'trustedAddresses';

/** Retrieve the list of trusted addresses. */
export async function getTrustedAddresses(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORE_KEY], (result: Partial<TrustedAddressStore>) => {
      resolve((result as any)[STORE_KEY] ?? []);
    });
  });
}

/** Add an address to the trusted list. */
export async function addTrustedAddress(address: string): Promise<void> {
  const current = await getTrustedAddresses();
  if (!current.includes(address)) {
    const updated = [...current, address];
    await new Promise<void>((res) => {
      chrome.storage.local.set({ [STORE_KEY]: updated }, () => res());
    });
  }
}

/** Remove an address from the trusted list. */
export async function removeTrustedAddress(address: string): Promise<void> {
  const current = await getTrustedAddresses();
  const updated = current.filter((a) => a !== address);
  await new Promise<void>((res) => {
    chrome.storage.local.set({ [STORE_KEY]: updated }, () => res());
  });
}
