import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { prisma } from './db.js'

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: '/auth/google/callback',
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const user = await prisma.user.upsert({
        where: { googleId: profile.id },
        update: {
          name: profile.displayName,
          avatarUrl: profile.photos?.[0]?.value,
          accessToken,
          refreshToken: refreshToken || undefined,
        },
        create: {
          googleId: profile.id,
          email: profile.emails![0].value,
          name: profile.displayName,
          avatarUrl: profile.photos?.[0]?.value,
          accessToken,
          refreshToken: refreshToken || undefined,
        }
      })
      done(null, user)
    } catch (err) {
      done(err as Error)
    }
  }
))

passport.serializeUser((user, done) => done(null, (user as { id: string }).id))
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } })
    done(null, user)
  } catch (err) {
    done(err)
  }
})

export default passport
