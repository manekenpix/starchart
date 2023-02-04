import type { User } from '@prisma/client';

import { prisma } from '~/db.server';

export type { User } from '@prisma/client';

export async function getUserByUsername(username: User['username']) {
  return prisma.user.findUnique({ where: { username } });
}

export async function createUser(
  username: User['username'],
  firstName: User['firstName'],
  lastName: User['lastName'],
  email: User['email']
) {
  return prisma.user.create({
    data: {
      username,
      firstName,
      lastName,
      email,
    },
  });
}

export async function deleteUserByEmail(email: User['email']) {
  return prisma.user.delete({ where: { email } });
}