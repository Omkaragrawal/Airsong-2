import ipaddr from 'ipaddr.js';

/** How many of an IPv6 address's eight 16-bit groups make up its /64 network prefix. */
const IPV6_PREFIX_GROUPS = 4;
const IPV6_GROUPS = 8;

/**
 * Returns the key that groups clients on the same network, for nearby discovery.
 *
 * - IPv4: the address itself, because a home or office shares one public IPv4 address.
 * - IPv4-mapped IPv6 (`::ffff:203.0.113.7`): the IPv4 address inside it.
 * - IPv6: the /64 prefix (`2001:db8:1:2::/64`), because each device has its own address
 *   within the network's /64.
 *
 * Throws when the input isn't an IP address.
 */
export function networkKey(ip: string): string {
  // `process` parses the address and turns an IPv4-mapped IPv6 address into IPv4.
  const address = ipaddr.process(ip);
  if (address instanceof ipaddr.IPv4) {
    return address.toString();
  }
  const prefixGroups = address.parts.slice(0, IPV6_PREFIX_GROUPS);
  const hostGroups = new Array<number>(IPV6_GROUPS - IPV6_PREFIX_GROUPS).fill(0);
  const network = new ipaddr.IPv6([...prefixGroups, ...hostGroups]);
  return `${network.toRFC5952String()}/64`;
}
