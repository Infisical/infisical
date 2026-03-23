import { BlockList, isIPv6 } from "node:net";

import { BadRequestError } from "../errors";
// Define BlockList instances for each range type
const ipv4RangeLists: Record<string, BlockList> = {
  unspecified: new BlockList(),
  broadcast: new BlockList(),
  multicast: new BlockList(),
  linkLocal: new BlockList(),
  loopback: new BlockList(),
  carrierGradeNat: new BlockList(),
  private: new BlockList(),
  reserved: new BlockList()
};

// Add IPv4 CIDR ranges to each BlockList
ipv4RangeLists.unspecified.addSubnet("0.0.0.0", 8);
ipv4RangeLists.broadcast.addAddress("255.255.255.255");
ipv4RangeLists.multicast.addSubnet("224.0.0.0", 4);
ipv4RangeLists.linkLocal.addSubnet("169.254.0.0", 16);
ipv4RangeLists.loopback.addSubnet("127.0.0.0", 8);
ipv4RangeLists.carrierGradeNat.addSubnet("100.64.0.0", 10);

// IPv4 Private ranges
ipv4RangeLists.private.addSubnet("10.0.0.0", 8);
ipv4RangeLists.private.addSubnet("172.16.0.0", 12);
ipv4RangeLists.private.addSubnet("192.168.0.0", 16);

// IPv4 Reserved ranges
ipv4RangeLists.reserved.addSubnet("192.0.0.0", 24);
ipv4RangeLists.reserved.addSubnet("192.0.2.0", 24);
ipv4RangeLists.reserved.addSubnet("192.88.99.0", 24);
ipv4RangeLists.reserved.addSubnet("198.18.0.0", 15);
ipv4RangeLists.reserved.addSubnet("198.51.100.0", 24);
ipv4RangeLists.reserved.addSubnet("203.0.113.0", 24);
ipv4RangeLists.reserved.addSubnet("240.0.0.0", 4);

// Define BlockList instances for IPv6 range types
const ipv6RangeLists: Record<string, BlockList> = {
  unspecified: new BlockList(),
  loopback: new BlockList(),
  multicast: new BlockList(),
  linkLocal: new BlockList(),
  uniqueLocal: new BlockList(),
  ipv4Mapped: new BlockList(),
  reserved: new BlockList()
};

// Add IPv6 CIDR ranges to each BlockList
ipv6RangeLists.unspecified.addSubnet("::", 128, "ipv6");
ipv6RangeLists.loopback.addSubnet("::1", 128, "ipv6");
ipv6RangeLists.multicast.addSubnet("ff00::", 8, "ipv6");
ipv6RangeLists.linkLocal.addSubnet("fe80::", 10, "ipv6");
// fc00::/7 covers both fc00::/8 and fd00::/8 (ULA)
ipv6RangeLists.uniqueLocal.addSubnet("fc00::", 7, "ipv6");
// IPv4-mapped IPv6 addresses (::ffff:0:0/96) — prevents bypass via e.g. ::ffff:127.0.0.1
ipv6RangeLists.ipv4Mapped.addSubnet("::ffff:0:0", 96, "ipv6");
// IPv6 documentation (2001:db8::/32), benchmarking (2001:2::/48), discard (100::/64)
ipv6RangeLists.reserved.addSubnet("2001:db8::", 32, "ipv6");
ipv6RangeLists.reserved.addSubnet("2001:2::", 48, "ipv6");
ipv6RangeLists.reserved.addSubnet("100::", 64, "ipv6");
// 6to4 (2002::/16) — embeds IPv4 in bits 16-47; e.g. 2002:7f00:0001:: encodes 127.0.0.1
ipv6RangeLists.reserved.addSubnet("2002::", 16, "ipv6");
// NAT64 well-known prefix (64:ff9b::/96) — maps IPv6 to IPv4; e.g. 64:ff9b::7f00:1 → 127.0.0.1
ipv6RangeLists.reserved.addSubnet("64:ff9b::", 96, "ipv6");
// Local-use NAT64 prefix (64:ff9b:1::/48) — RFC 8215
ipv6RangeLists.reserved.addSubnet("64:ff9b:1::", 48, "ipv6");

/**
 * Checks if an IP address (IPv4 or IPv6) is private or public
 * inspired by: https://github.com/whitequark/ipaddr.js/blob/main/lib/ipaddr.js
 */
export const getIpRange = (ip: string): string => {
  try {
    if (isIPv6(ip)) {
      // Check IPv6 ranges
      for (const rangeName in ipv6RangeLists) {
        if (Object.hasOwn(ipv6RangeLists, rangeName)) {
          if (ipv6RangeLists[rangeName].check(ip, "ipv6")) {
            return rangeName;
          }
        }
      }
    } else {
      // Check IPv4 ranges
      for (const rangeName in ipv4RangeLists) {
        if (Object.hasOwn(ipv4RangeLists, rangeName)) {
          if (ipv4RangeLists[rangeName].check(ip)) {
            return rangeName;
          }
        }
      }
    }

    // If no range matched, it's a public address
    return "unicast";
  } catch (error) {
    throw new BadRequestError({ message: "Invalid IP address", error });
  }
};

export const isPrivateIp = (ip: string) => getIpRange(ip) !== "unicast";
