import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('project scaffold', () => {
  it('backend package.json has ESM and required deps', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))
    expect(pkg.type).toBe('module')
    expect(pkg.dependencies).toHaveProperty('@prisma/client')
    expect(pkg.dependencies).toHaveProperty('express')
    expect(pkg.dependencies).toHaveProperty('passport')
    expect(pkg.dependencies).toHaveProperty('passport-google-oauth20')
    expect(pkg.dependencies).toHaveProperty('googleapis')
    expect(pkg.dependencies).toHaveProperty('@anthropic-ai/sdk')
    expect(pkg.dependencies).toHaveProperty('express-session')
    expect(pkg.dependencies).toHaveProperty('connect-pg-simple')
    expect(pkg.dependencies).toHaveProperty('zod')
  })
})
