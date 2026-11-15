interface Props {
  value: string
  disabled: boolean
  onChange: (value: string) => void
}

export function CommentInput({ value, disabled, onChange }: Props) {
  const isIPhoneSafari = typeof navigator !== 'undefined' && /iPhone|iPod/.test(navigator.userAgent)
    && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent)
  return <div className="board-comment-input" data-iphone-safari={isIPhoneSafari || undefined}>
    <textarea aria-label="コメント（任意）" placeholder="コメント（任意）" rows={1} disabled={disabled} value={value} onChange={event => onChange(event.target.value)} />
    {value && <button type="button" aria-label="コメントをクリア" title="コメントをクリア" disabled={disabled} onClick={() => onChange('')}>×</button>}
  </div>
}
