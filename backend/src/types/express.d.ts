import type { User } from '@prisma/client'
declare global {
  namespace Express {
    interface User extends import('@prisma/client').User {}
  }
}
