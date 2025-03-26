import { BlockList } from "node:net";

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

/**
 * Checks if an IP address (IPv4) is private or public
 * inspired by: https://github.com/whitequark/ipaddr.js/blob/main/lib/ipaddr.js
 */
export const getIpRange = (ip: string): string => {
  try {
    const rangeLists = ipv4RangeLists;
    // Check each range type
    for (const rangeName in rangeLists) {
      if (Object.hasOwn(rangeLists, rangeName)) {
        if (rangeLists[rangeName].check(ip)) {
          return rangeName;
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
