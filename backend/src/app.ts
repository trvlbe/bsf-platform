import express from 'express'
import cors from 'cors'
import session from 'express-session'
import ConnectPgSimple from 'connect-pg-simple'
import { healthRouter } from './routes/health.js'
import passport from './lib/passport.js'
import { authRouter } from './routes/auth.js'
import { driveRouter } from './routes/drive.js'
import { campaignsRouter } from './routes/campaigns.js'

const PgStore = ConnectPgSimple(session)

export function createApp() {
  const app = express()

  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5174',
    credentials: true,
  }))
  app.use(express.json())

  const sessionSecret = process.env.SESSION_SECRET
  if (!sessionSecret && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required in production')
  }

  app.use(session({
    store: new PgStore({ conString: process.env.DATABASE_URL }),
    secret: sessionSecret || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    }
  }))

  app.use(passport.initialize())
  app.use(passport.session())

  app.use('/health', healthRouter)
  app.use('/auth', authRouter)
  app.use('/api/drive', driveRouter)
  app.use('/api/campaigns', campaignsRouter)

  return app
}

export const app = createApp()
