import { useEffect, useState } from 'react'
import { fetchImageUrl } from '../api.js'

// Loads a photo (with the login token if needed). Click the photo to zoom in or out.
export default function AuthedImage({ path, token, alt }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(false)

  useEffect(() => {
    let live = true
    let made = null
    setUrl(null)
    setFailed(false)
    fetchImageUrl(path, token)
      .then((u) => {
        made = u
        if (live) setUrl(u)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [path, token])

  if (failed) return <p className="muted">The photo could not be loaded.</p>
  if (!url) return <p className="muted">Loading photo…</p>
  return (
    <img
      src={url}
      alt={alt}
      className={'sheet-photo' + (zoom ? ' zoomed' : '')}
      onClick={() => setZoom(!zoom)}
      title="Click to zoom"
    />
  )
}
