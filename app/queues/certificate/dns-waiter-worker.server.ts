import { UnrecoverableError, Worker } from 'bullmq';
import { redis } from '~/lib/redis.server';
import logger from '~/lib/logger.server';
import LetsEncrypt from '~/lib/lets-encrypt.server';
import * as challengeModel from '~/models/challenge.server';

import type { CertificateJobData } from './certificateJobTypes.server';
import { isUserDeactivated } from '~/models/user.server';

export const dnsWaiterQueueName = 'certificate-waitDns';

/**
 * This worker
 * - Takes the certificate id from the child "order-creator-worker"
 * - Reloads the challenges from DB
 * - Verifies each challenge
 *   - If all successful, completes this queue
 *   - If any fails, it throws, so BullMQ will retry
 */

export const dnsWaiterWorker = new Worker<CertificateJobData>(
  dnsWaiterQueueName,
  async (job) => {
    const { rootDomain, username, certificateId } = job.data;

    if (process.env.NODE_ENV !== 'production') {
      logger.info('Not checking DNS on development - Mock server is not our recursor');
      return;
    }

    if (await isUserDeactivated(username)) {
      logger.error('User is deactivated, skipping checking challenges');
      throw new UnrecoverableError('User is deactivated');
    }

    logger.info('Checking challenges in DNS', {
      rootDomain,
      certificateId,
    });

    const challenges = await challengeModel.getChallengesByCertificateId(certificateId);

    // Using a for .. of loop here instead of forEach to be able to await
    for (const challenge of challenges) {
      logger.debug('Checking challenge', {
        rootDomain,
        certificateId,
        domain: challenge.domain,
        key: challenge.challengeKey,
      });

      const challengeResult = await LetsEncrypt.verifyChallenge({
        domain: challenge.domain,
        key: challenge.challengeKey,
      });

      if (!challengeResult) {
        logger.debug('Challenge **not found** in DNS', {
          rootDomain,
          certificateId,
          domain: challenge.domain,
          key: challenge.challengeKey,
        });
        throw new Error(`At least one challenge is failing on ${rootDomain}`);
      }

      logger.info('All challenges successfully verified in DNS', {
        rootDomain,
        certificateId,
      });
    }
  },
  { connection: redis }
);

process.on('SIGINT', () => dnsWaiterWorker.close());
