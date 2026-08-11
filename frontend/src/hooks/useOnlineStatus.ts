import { useEffect, useState } from 'react'

// navigator.onLine reflects "is there a network interface at all" (wifi/cellular connected) -
// it can't tell you the backend is actually reachable, but it's instant and needs no request of
// its own, which is exactly what a persistent "you're offline" banner wants. The cold-start "can't
// reach the server" case (ConnectionError, wired through useAuth) is the complementary check that
// catches everything this one can't - a real request that fails.
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
    }
    function handleOffline() {
      setIsOnline(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
