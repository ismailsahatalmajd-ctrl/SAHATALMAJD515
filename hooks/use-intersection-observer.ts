import { useEffect, useState, RefObject } from 'react'

interface UseIntersectionObserverProps extends IntersectionObserverInit {
  freezeOnceVisible?: boolean
}

export function useIntersectionObserver<T extends Element>(
  elementRef: RefObject<T | null>,
  {
    threshold = 0,
    root = null,
    rootMargin = '0%',
    freezeOnceVisible = false,
  }: UseIntersectionObserverProps,
): boolean {
  const [isVisible, setIsVisible] = useState<boolean>(false)

  useEffect(() => {
    const node = elementRef?.current
    const hasIOSupport = !!window.IntersectionObserver

    if (!hasIOSupport || !node || (freezeOnceVisible && isVisible)) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
      },
      { threshold, root, rootMargin },
    )

    observer.observe(node)

    return () => observer.disconnect()
  }, [elementRef, JSON.stringify(threshold), root, rootMargin, freezeOnceVisible, isVisible])

  return isVisible
}
