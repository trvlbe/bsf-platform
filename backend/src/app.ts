import express from 'express'
import cors from 'cors'
import session from 'express-session'
import ConnectPgSimple from 'connect-pg-simple'
import { healthRouter } from './routes/health.js'
import { requireAuth } from './middleware/requireAuth.js'
import passport from './lib/passport.js'
import { authRouter } from './routes/auth.js'
import { driveRouter } from './routes/drive.js'

const PgStore = ConnectPgSimple(session)

export function createApp() {
  const app = express()

  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5174',
    credentials: true,
  }))
  app.use(express.json())

  app.use(session({
    store: new PgStore({ conString: process.env.DATABASE_URL }),
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
    }
  }))

  app.use(passport.initialize())
  app.use(passport.session())

  app.use('/health', healthRouter)
  app.use('/auth', authRouter)
  app.use('/api/drive', driveRouter)
  app.use('/api/campaigns', requireAuth, (_req, res) => res.json([]))

  return app
}

export const app = createApp()
