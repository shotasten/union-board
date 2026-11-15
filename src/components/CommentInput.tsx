interface Props {
  value: string
  disabled: boolean
  onChange: (value: string) => void
}

export function CommentInput({ value, disabled, onChange }: Props) {
  return <div className="board-comment-input">
    <textarea aria-label="コメント（任意）" placeholder="コメント（任意）" rows={1} disabled={disabled} value={value} onChange={event => onChange(event.target.value)} />
    {value && <button type="button" aria-label="コメントをクリア" title="コメントをクリア" disabled={disabled} onClick={() => onChange('')}>×</button>}
  </div>
}
