import 'dotenv/config'
import { app } from './app.js'
import { pollAllPendingPosts } from './lib/higgsfield.js'

const PORT = process.env.PORT || 4001
app.listen(PORT, () => console.log(`BSF Platform backend :${PORT}`))

// Poll Higgsfield every 30 seconds for pending video jobs
setInterval(async () => {
  try {
    await pollAllPendingPosts()
  } catch {
    // silent — never crash the server on poll failure
  }
}, 30_000)
