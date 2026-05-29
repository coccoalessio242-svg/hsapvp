import express from 'express'
import dotenv from 'dotenv'
import { request } from 'undici'

dotenv.config()

const app = express()
const port = process.env.PORT ? Number(process.env.PORT) : 3000
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || ''
const GUILD_ID = process.env.GUILD_ID || ''
const WHITELIST_ROLE_IDS = (process.env.WHITELIST_ROLE_IDS || '').split(',').map(id => id.trim()).filter(Boolean)

if (!DISCORD_TOKEN || !GUILD_ID) {
  console.error('ERROR: DISCORD_TOKEN and GUILD_ID must be configured.')
  process.exit(1)
}

const DISCORD_API_BASE = 'https://discord.com/api/v10'

function buildAvatarUrl(discordId, avatarHash) {
  if (!discordId || !avatarHash) {
    return `https://cdn.discordapp.com/embed/avatars/0.png`
  }
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png'
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=128`
}

async function fetchDiscordGuildMember(discordId) {
  const url = `${DISCORD_API_BASE}/guilds/${GUILD_ID}/members/${discordId}`
  const res = await request(url, {
    method: 'GET',
    headers: {
      Authorization: `Bot ${DISCORD_TOKEN}`,
      'Content-Type': 'application/json'
    }
  })

  if (res.statusCode === 404) {
    return null
  }
  if (res.statusCode !== 200) {
    const text = await res.body.text()
    throw new Error(`Discord API error ${res.statusCode}: ${text}`)
  }

  const data = await res.body.json()
  return data
}

function hasRequiredRole(memberRoles) {
  if (WHITELIST_ROLE_IDS.length === 0) return true
  for (const roleId of memberRoles) {
    if (WHITELIST_ROLE_IDS.includes(roleId)) {
      return true
    }
  }
  return false
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  next()
})

app.get('/health', (req, res) => {
  res.json({ ok: true, guildId: GUILD_ID, whitelistRoles: WHITELIST_ROLE_IDS })
})

app.get('/user/:discordId', async (req, res) => {
  const discordId = req.params.discordId
  if (!discordId) {
    return res.status(400).json({ error: 'discordId is required' })
  }

  try {
    const member = await fetchDiscordGuildMember(discordId)
    if (!member) {
      return res.status(404).json({ error: 'Member not found in guild' })
    }

    const user = member.user || {}
    const avatarUrl = buildAvatarUrl(discordId, user.avatar)
    const hasWhitelistRole = hasRequiredRole(member.roles || [])

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        avatarUrl
      },
      roles: member.roles || [],
      hasWhitelistRole
    })
  } catch (error) {
    console.error('Error fetching Discord member:', error)
    return res.status(500).json({ error: 'Unable to fetch Discord user data' })
  }
})

app.get('/check-role', async (req, res) => {
  const discordId = req.query.discordId
  if (typeof discordId === 'undefined' || discordId === '') {
    return res.status(400).json({ error: 'discordId query parameter is required' })
  }

  try {
    const member = await fetchDiscordGuildMember(discordId)
    if (!member) {
      return res.json({ hasWhitelistRole: false, roles: [] })
    }

    const hasWhitelistRole = hasRequiredRole(member.roles || [])
    return res.json({ hasWhitelistRole, roles: member.roles || [] })
  } catch (error) {
    console.error('Error checking role:', error)
    return res.status(500).json({ error: 'Unable to check Discord role' })
  }
})

app.listen(port, () => {
  console.log(`Discord service running on port ${port}`)
})
