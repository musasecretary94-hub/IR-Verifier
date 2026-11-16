// All talking to the server happens here.
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Something went wrong')
    this.status = status
    this.code = body?.error?.code
    this.findings = body?.error?.findings
  }
}

export async function api(path, { method = 'GET', body, token } = {}) {
  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, { error: { code: 'network', message: 'Cannot reach the server. Is it running?' } })
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    // the answer was not JSON
  }
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

// Photos need the login token, so we download them ourselves and show them from memory.
export async function fetchImageUrl(path, token) {
  const res = await fetch(BASE + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
  if (!res.ok) throw new ApiError(res.status, null)
  return URL.createObjectURL(await res.blob())
}
