import type { FullscreenLoaderState } from '../hooks/useAppState'

interface Props {
  loader: FullscreenLoaderState
}

export function FullscreenLoader({ loader }: Props) {
  return (
    <div className="fullscreen-loader active">
      <div className="loader-spinner"></div>
      <div className="loader-text">{loader.text}</div>
    </div>
  )
}
