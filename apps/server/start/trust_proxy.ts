import proxyAddr from 'proxy-addr';

/** The predicate proxy-addr uses: given a hop's remote address and its index, trust it or not. */
export type TrustProxyFnType = (address: string, index: number) => boolean;

const TRUST_ALL: TrustProxyFnType = (): boolean => true;
const TRUST_NONE: TrustProxyFnType = (): boolean => false;

/**
 * Turns a TRUST_PROXY setting into a proxy-addr predicate. `true`/`false` trust all or no proxies.
 * Any other value is a comma-separated proxy-addr trust list (`loopback`, `uniquelocal`, a CIDR, …):
 * it is split, each entry trimmed, and empty entries dropped before compiling, because proxy-addr
 * treats a raw comma-joined string as one (invalid) value and refuses to start. Throws on an empty
 * or invalid list. Shared by start/env.ts (to validate) and config/app.ts (to build the predicate),
 * so the parsing lives in one place.
 */
export function compileTrustProxy(raw: string): TrustProxyFnType {
  const trimmed = raw.trim();
  if (trimmed === 'true') {
    return TRUST_ALL;
  }
  if (trimmed === 'false') {
    return TRUST_NONE;
  }
  const list = trimmed
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (list.length === 0) {
    throw new Error('TRUST_PROXY must be "true", "false", or a non-empty proxy-addr trust list');
  }
  return proxyAddr.compile(list);
}
