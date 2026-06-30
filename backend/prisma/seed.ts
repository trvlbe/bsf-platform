import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.upsert({
    where: { googleId: 'dev-seed-user' },
    update: {},
    create: {
      googleId: 'dev-seed-user',
      email: 'tj@bluskyfable.dev',
      name: 'TJ Travelbee (dev)',
      avatarUrl: null,
    }
  })
  console.log('Seeded user:', user.email)
}

main().catch(console.error).finally(() => prisma.$disconnect())
