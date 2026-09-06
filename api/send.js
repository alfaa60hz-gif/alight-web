import crypto from 'node:crypto'

const BASE_URL = 'https://www.alightpro.my.id'

function sha256(str) {
  return crypto
    .createHash('sha256')
    .update(str)
    .digest('hex')
}

async function solvePoW(
  sessionId,
  nonce,
  email,
  action,
  difficulty = '0000'
) {
  const prefix =
    `${sessionId}:${nonce}:${email.toLowerCase()}:${action}:`

  for (let r = 0; r < 500000; r++) {
    const nonceStr = r.toString()

    if (
      sha256(prefix + nonceStr)
        .startsWith(difficulty)
    ) {
      return nonceStr
    }
  }

  return Date.now().toString()
}

function parseCookie(cookieHeader) {
  if (!cookieHeader) return ''

  return cookieHeader
    .split(',')
    .map(c => c.split(';')[0].trim())
    .join('; ')
}

async function getSessionHeaders() {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept':
      'application/json, text/plain, */*',
    'Accept-Language':
      'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin': BASE_URL,
    'Referer': `${BASE_URL}/`,
    'X-Requested-With': 'XMLHttpRequest'
  }

  const res = await fetch(
    `${BASE_URL}/api/session`,
    {
      headers,
      cache: 'no-store'
    }
  )

  if (!res.ok) {
    throw new Error(
      `Gagal mengambil session. HTTP ${res.status}`
    )
  }

  const rawCookie =
    res.headers.get('set-cookie')

  const cookie =
    parseCookie(rawCookie)

  const data =
    await res.json()

  if (
    !data.status ||
    !data.token ||
    !data.nonce
  ) {
    throw new Error(
      'Gagal mengambil sesi token dari server.'
    )
  }

  return {
    session: data,
    cookie,
    headers
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      status: false,
      message: 'Method tidak diizinkan.'
    })
  }

  try {
    const email =
      String(req.body?.email || '').trim()

    if (!email) {
      return res.status(400).json({
        status: false,
        message: 'Email wajib diisi.'
      })
    }

    const {
      session,
      cookie,
      headers
    } = await getSessionHeaders()

    const pow = await solvePoW(
      session.sessionId,
      session.nonce,
      email,
      'send',
      session.difficulty || '0000'
    )

    const reqHeaders = {
      ...headers,
      'Content-Type': 'application/json',
      'X-Amprem-Token': session.token,
      'X-Amprem-Nonce': session.nonce,
      'X-Amprem-Pow': pow
    }

    if (cookie) {
      reqHeaders.Cookie = cookie
    }

    const response = await fetch(
      `${BASE_URL}/api/alight-motion`,
      {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({
          action: 'send',
          email
        })
      }
    )

    const text =
      await response.text()

    let data

    try {
      data = JSON.parse(text)
    } catch {
      data = {
        status: response.ok,
        raw: text
      }
    }

    return res
      .status(response.status)
      .json(data)

  } catch (error) {
    console.error(error)

    return res.status(500).json({
      status: false,
      message:
        error?.message ||
        'Terjadi kesalahan pada server.'
    })
  }
}