import { useEffect, useState } from 'react'

/** Reflète l'état réseau réel du navigateur (utile pour le test offline du Jour 3 : couper vraiment Internet). */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return isOnline
}
