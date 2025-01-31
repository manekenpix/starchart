import { DnsRecordType } from '@prisma/client';
import dayjs from 'dayjs';
import { prisma } from '~/db.server';
import { setIsReconciliationNeeded } from './system-state.server';

import type { DnsRecord } from '@prisma/client';
import { isUserDeactivated } from './user.server';

export function getDnsRecordsByUsername(username: DnsRecord['username']) {
  return prisma.dnsRecord.findMany({
    where: {
      username,
      NOT: {
        type: DnsRecordType.TXT,
        subdomain: '_acme-challenge',
      },
    },
    orderBy: [
      {
        subdomain: 'asc',
      },
      {
        type: 'asc',
      },
      {
        value: 'asc',
      },
    ],
  });
}

export function getDnsRecordCountByUsername(username: DnsRecord['username']) {
  return prisma.dnsRecord.count({
    where: {
      username,
      NOT: {
        type: DnsRecordType.TXT,
        subdomain: '_acme-challenge',
      },
    },
  });
}

export function getDnsRecordById(id: DnsRecord['id']) {
  return prisma.dnsRecord.findUnique({ where: { id }, include: { user: true } });
}

export function getUserDnsRecordCount(username: DnsRecord['username']) {
  return prisma.dnsRecord.count({
    where: {
      username,
      NOT: {
        type: DnsRecordType.TXT,
        subdomain: '_acme-challenge',
      },
    },
  });
}

export async function createDnsRecord(
  data: Required<Pick<DnsRecord, 'username' | 'type' | 'subdomain' | 'value'>> & Partial<DnsRecord>
) {
  if (await isUserDeactivated(data.username)) {
    throw new Error('User is deactivated');
  }

  if (process.env.USER_DNS_RECORD_LIMIT) {
    if ((await getUserDnsRecordCount(data.username)) >= Number(process.env.USER_DNS_RECORD_LIMIT)) {
      throw new Error('User has reached the maximum number of dns records');
    }
  }

  if (await isDuplicateCname(data)) {
    throw new Error('Duplicate domain is not allowed  for CNAME records');
  }

  // Set expiration date 6 months from now
  const expiresAt = dayjs().add(6, 'month').toDate();

  return prisma.dnsRecord.create({ data: { ...data, expiresAt } }).then((result) => {
    // Flag the reconciler that an update will be needed
    setIsReconciliationNeeded(true);
    return result;
  });
}

// Update an existing DNS Record's data
export function updateDnsRecordById(
  id: DnsRecord['id'],
  data: Partial<
    Pick<DnsRecord, 'type' | 'subdomain' | 'value' | 'ports' | 'course' | 'description'>
  >
) {
  return prisma.dnsRecord
    .update({
      where: { id },
      data: {
        ...data,
        // Update expiry too
        expiresAt: dayjs().add(6, 'month').toDate(),
      },
    })
    .then((result) => {
      // Flag the reconciler that an update will be needed
      setIsReconciliationNeeded(true);
      return result;
    });
}

export function renewDnsRecordById(id: DnsRecord['id']) {
  return prisma.dnsRecord.update({
    where: {
      id,
    },
    data: {
      // Set expiration date 6 months from now
      expiresAt: dayjs().add(6, 'month').toDate(),
    },
  });
}

export async function isDuplicateCname(
  data: Pick<DnsRecord, 'username' | 'type' | 'subdomain' | 'value'>
) {
  const { username, type, subdomain } = data;

  /**
   * For CNAME records, we would consider it a duplicate if username
   * and subdomain are the same.
   */
  if (type === 'CNAME') {
    const count = await prisma.dnsRecord.count({
      where: {
        username,
        type,
        subdomain,
      },
    });
    return count > 0;
  }
  return false;
}

export function deleteDnsRecordById(id: DnsRecord['id']) {
  return prisma.dnsRecord.delete({ where: { id } }).then((result) => {
    // Flag the reconciler that an update will be needed
    setIsReconciliationNeeded(true);
    return result;
  });
}

export function getExpiredDnsRecords() {
  return prisma.dnsRecord.findMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
    include: {
      user: true,
    },
  });
}

/**
 * This Fn gets the base data that is needed for reconciliation
 * but does that for all records in the db. Should be no more than 10k
 *
 * This serves as the ground truth for the entire DNS system, data is
 * synchronized to Route53 from this
 */
export function getReconciliationData() {
  return prisma.dnsRecord.findMany({
    select: { username: true, subdomain: true, type: true, value: true },
  });
}

export function getTotalDnsRecordCount(): Promise<number> {
  return prisma.dnsRecord.count();
}
