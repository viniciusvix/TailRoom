import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  CirclePause,
  CirclePlay,
  FileUp,
  Filter,
  FolderOpen,
  Globe,
  Info,
  LocateFixed,
  LogOut,
  Mail,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  SquareTerminal,
  Trash2,
  X,
} from 'lucide-react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type Level = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
type LogLine = { id: number; timestamp: string; level: Level; message: string }
type SearchTerm = { id: string; text: string; color: string }
type HistoryEntry = { id: string; name: string; url?: string; handle?: FileSystemFileHandle }

const termColors = ['#f2b56b', '#77d6b1', '#91b6f2', '#e894a8', '#c9a4e8', '#e8d56e']

const seedLines: LogLine[] = [
  { id: 1, timestamp: '14:32:07.104', level: 'INFO', message: 'Tailroom started · watching workspace logs' },
  { id: 2, timestamp: '14:32:07.218', level: 'INFO', message: 'Connected to database pool (max=12)' },
  { id: 3, timestamp: '14:32:08.004', level: 'DEBUG', message: 'GET /api/health 200 18ms' },
  { id: 4, timestamp: '14:32:09.622', level: 'INFO', message: 'Worker queue ready, waiting for jobs' },
  { id: 5, timestamp: '14:32:11.015', level: 'WARN', message: 'Retrying request after a 429 response (attempt 2/3)' },
  { id: 6, timestamp: '14:32:11.836', level: 'DEBUG', message: 'cache:hit key=session:8fa1 ttl=284s' },
  { id: 7, timestamp: '14:32:12.440', level: 'INFO', message: 'POST /api/events 201 42ms' },
  { id: 8, timestamp: '14:32:14.091', level: 'ERROR', message: 'Timeout while resolving upstream: payments.internal' },
  { id: 9, timestamp: '14:32:14.093', level: 'INFO', message: 'Circuit breaker opened for payments.internal' },
  { id: 10, timestamp: '14:32:15.507', level: 'DEBUG', message: 'healthcheck:redis latency=3ms status=ok' },
]

const levelClass: Record<Level, string> = { INFO: 'info', WARN: 'warn', ERROR: 'error', DEBUG: 'debug' }

function AuthScreen({ onGoogleSignIn }: { onGoogleSignIn: () => void }) {
  const [isSigningIn, setIsSigningIn] = useState(false)

  async function signIn() {
    setIsSigningIn(true)
    onGoogleSignIn()
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand"><span className="brand-mark"><Activity size={17} /></span><strong>tailroom</strong></div>
        <div className="auth-icon"><ShieldCheck size={25} /></div>
        <span className="auth-kicker">PRIVATE LOG WORKSPACE</span>
        <h1>Seus logs, sob seu controle.</h1>
        <p className="auth-copy">Entre com sua conta Google para acessar seu espaço de trabalho com uma sessão protegida.</p>
        <button className="google-button" onClick={() => void signIn()} disabled={isSigningIn || !isSupabaseConfigured}><Mail size={17} />{isSigningIn ? 'Redirecionando...' : 'Continuar com Google'}</button>
        {!isSupabaseConfigured && <p className="auth-warning">Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para ativar o login.</p>}
        <div className="auth-security"><ShieldCheck size={14} /><span>OAuth do Google · sessão renovada automaticamente · dados isolados por usuário</span></div>
      </section>
    </main>
  )
}

function ProfileMenu({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const name = user.user_metadata.full_name || user.email?.split('@')[0] || 'Usuário'
  const initials = name.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase()

  return <div className="profile-wrap"><button className="avatar" title="Abrir perfil" onClick={() => setOpen(!open)}>{initials}</button>{open && <div className="profile-menu"><div className="profile-identity"><div className="avatar large">{initials}</div><div><strong>{name}</strong><span>{user.email}</span></div></div><div className="profile-divider" /><button className="profile-action" onClick={onSignOut}><LogOut size={14} /> Sair da conta</button></div>}</div>
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(date.getMilliseconds()).padStart(3, '0')
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured)
  const [authError, setAuthError] = useState('')
  const [lines, setLines] = useState<LogLine[]>([])
  const [fileName, setFileName] = useState('')
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [sourceError, setSourceError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [follow, setFollow] = useState(true)
  const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([])
  const [termInput, setTermInput] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [level, setLevel] = useState<'ALL' | Level>('ALL')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [showLineNumbers, setShowLineNumbers] = useState(true)
  const [wrapLines, setWrapLines] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('live')
  const [isDragging, setIsDragging] = useState(false)
  const [selectedLine, setSelectedLine] = useState<{ line: LogLine; number: number } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastSizeRef = useRef(0)
  const lastRemoteTextRef = useRef('')

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let active = true
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setAuthError('Não foi possível restaurar sua sessão.')
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
      if (nextSession?.user) {
        void client.from('profiles').upsert({
          id: nextSession.user.id,
          display_name: nextSession.user.user_metadata.full_name ?? null,
          avatar_url: nextSession.user.user_metadata.avatar_url ?? null,
          email: nextSession.user.email ?? null,
        }, { onConflict: 'id' })
      }
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function signInWithGoogle() {
    if (!supabase) return
    setAuthError('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (error) setAuthError('Não foi possível iniciar o login com Google.')
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  if (!authReady) return <main className="auth-shell"><div className="loading-spinner" /></main>
  if (!session) return <><AuthScreen onGoogleSignIn={() => void signInWithGoogle()} />{authError && <div className="auth-toast">{authError}</div>}</>

  function addSearchTerms(value: string) {
    const values = value.split(/[\s,]+/).map((term) => term.trim()).filter(Boolean)
    if (!values.length) return
    setSearchTerms((current) => {
      const existing = new Set(current.map((term) => term.text.toLowerCase()))
      const added = values.filter((term) => !existing.has(term.toLowerCase())).map((text, index) => ({
        id: `${Date.now()}-${index}`,
        text,
        color: termColors[(current.length + index) % termColors.length],
      }))
      return [...current, ...added]
    })
    setTermInput('')
  }

  function removeSearchTerm(id: string) {
    setSearchTerms((current) => current.filter((term) => term.id !== id))
  }

  function addHistory(entry: HistoryEntry) {
    setHistory((current) => [entry, ...current.filter((item) => item.id !== entry.id)])
  }

  useEffect(() => {
    if (!selectedLine) return
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedLine(null)
    }
    window.addEventListener('keydown', closeWithEscape)
    return () => window.removeEventListener('keydown', closeWithEscape)
  }, [selectedLine])

  const filteredLines = useMemo(() => {
    return lines.filter((line) => {
      const message = caseSensitive ? line.message : line.message.toLowerCase()
      const matchesAnyTerm = searchTerms.some((term) => message.includes(caseSensitive ? term.text : term.text.toLowerCase()))
      return (level === 'ALL' || line.level === level) && (searchTerms.length === 0 || matchesAnyTerm)
    })
  }, [caseSensitive, level, lines, searchTerms])

  const lineMatchesQuery = (message: string) => {
    const searchableMessage = caseSensitive ? message : message.toLowerCase()
    return searchTerms.length > 0 && searchTerms.some((term) => searchableMessage.includes(caseSensitive ? term.text : term.text.toLowerCase()))
  }

  function highlightMessage(message: string) {
    if (!searchTerms.length) return message
    const pattern = new RegExp(`(${searchTerms.map((term) => term.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, caseSensitive ? 'g' : 'gi')
    return message.split(pattern).map((part, index) => {
      const term = searchTerms.find((item) => item.text.toLowerCase() === part.toLowerCase())
      return term ? <mark key={`${part}-${index}`} style={{ backgroundColor: term.color, color: '#15201f' }}>{part}</mark> : part
    })
  }


  function getRemoteRequestUrl(url: string) {
    return url
  }
  useEffect(() => {
    if (follow && !isPaused && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [filteredLines.length, follow, isPaused])

  useEffect(() => {
    if (!fileHandle || isPaused) return
    const poll = window.setInterval(async () => {
      const file = await fileHandle.getFile()
      if (file.size <= lastSizeRef.current) return
      const added = (await file.slice(lastSizeRef.current).text()).split(/\r?\n/).filter(Boolean)
      lastSizeRef.current = file.size
      if (!added.length) return
      setLines((current) => [...current, ...added.map((message, index) => ({
        id: Date.now() + index,
        timestamp: formatTime(),
        level: (/error|fatal/i.test(message) ? 'ERROR' : /warn/i.test(message) ? 'WARN' : /debug/i.test(message) ? 'DEBUG' : 'INFO') as Level,
        message,
      }))])
      setLastUpdated('just now')
    }, 1000)
    return () => window.clearInterval(poll)
  }, [fileHandle, isPaused])

  useEffect(() => {
    if (!sourceUrl || isPaused) return
    let active = true
    const pollRemote = async () => {
      try {
        const response = await fetch(getRemoteRequestUrl(sourceUrl), { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const text = await response.text()
        if (!active || text === lastRemoteTextRef.current) return
        lastRemoteTextRef.current = text
        await loadText(text, getRemoteName(sourceUrl))
        setLastUpdated('just now')
        setSourceError('')
        setLastUpdated('just now')
        setSourceError('')
      } catch (error) {
        if (active) setSourceError(`Não foi possível atualizar a URL: ${error instanceof Error ? error.message : 'erro desconhecido'}. Verifique o endereço ou o CORS.`)
      }
    }
    const interval = window.setInterval(pollRemote, 1000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [isPaused, sourceUrl])

  function getRemoteName(url: string) {
    try {
      return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || new URL(url).hostname)
    } catch {
      return 'remote-log'
    }
  }

  async function openFile() {
    if ('showOpenFilePicker' in window) {
      const picker = (window as Window & { showOpenFilePicker: (options?: object) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker
      const [handle] = await picker({ types: [{ description: 'Log files', accept: { 'text/plain': ['.log', '.txt'] } }] })
      setIsLoading(true)
      try {
        const file = await handle.getFile()
        const text = await file.text()
        await loadText(text, file.name)
        setFileHandle(handle)
        setSourceUrl('')
        setSourceError('')
        addHistory({ id: `file:${file.name}`, name: file.name, handle })
        lastSizeRef.current = file.size
      } finally {
        setIsLoading(false)
      }
      return
    }
    inputRef.current?.click()
  }

  async function loadText(text: string, name: string) {
    let displayText = text
    try {
      const parsedJson: unknown = JSON.parse(text)
      displayText = typeof parsedJson === 'string' ? parsedJson : JSON.stringify(parsedJson, null, 2)
    } catch {
      // Plain text logs are displayed as received.
    }
    const parsed = displayText.split(/\r?\n/).filter(Boolean).map((message, index) => ({
      id: index + 1,
      timestamp: formatTime(),
      level: /error|fatal/i.test(message) ? 'ERROR' as Level : /warn/i.test(message) ? 'WARN' as Level : /debug/i.test(message) ? 'DEBUG' as Level : 'INFO' as Level,
      message,
    }))
    setLines(parsed)
    setFileName(name)
    setLastUpdated('just now')
  }

  async function openUrl() {
    const url = urlInput.trim()
    if (!/^https?:\/\//i.test(url)) {
      setSourceError('Informe uma URL HTTP ou HTTPS válida.')
      return
    }
    try {
      setSourceError('')
      setIsLoading(true)
      const response = await fetch(getRemoteRequestUrl(url), { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = await response.text()
      lastRemoteTextRef.current = text
      await loadText(text, getRemoteName(url))
      setFileHandle(null)
      setSourceUrl(url)
      setUrlInput(url)
      setShowUrlInput(false)
      addHistory({ id: `url:${url}`, name: getRemoteName(url), url })
    } catch (error) {
      setSourceError(`Não foi possível abrir a URL: ${error instanceof Error ? error.message : 'erro desconhecido'}. Verifique o endereço ou o CORS.`)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleFallbackFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      setIsLoading(true)
      try {
        await loadText(await file.text(), file.name)
        addHistory({ id: `file:${file.name}`, name: file.name })
      } finally {
        setIsLoading(false)
      }
    }
  }

  async function selectHistory(entry: HistoryEntry) {
    if (entry.url) {
      setUrlInput(entry.url)
      setIsLoading(true)
      try {
        const response = await fetch(entry.url, { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const text = await response.text()
        lastRemoteTextRef.current = text
        await loadText(text, entry.name)
        setFileHandle(null)
        setSourceUrl(entry.url)
        setSourceError('')
      } catch (error) {
        setSourceError(`Não foi possível abrir o histórico: ${error instanceof Error ? error.message : 'erro desconhecido'}`)
      } finally {
        setIsLoading(false)
      }
      return
    }
    if (entry.handle) {
      setIsLoading(true)
      try {
        const file = await entry.handle.getFile()
        await loadText(await file.text(), file.name)
        setFileHandle(entry.handle)
        setSourceUrl('')
        lastSizeRef.current = file.size
      } finally {
        setIsLoading(false)
      }
    }
  }

  function clearView() {
    setLines([])
    setLastUpdated('cleared')
  }

  function resetSample() {
    setLines([])
    setFileName('')
    setFileHandle(null)
    setSourceUrl('')
    setSourceError('')
    setUrlInput('')
    setLastUpdated('live')
    setSearchTerms([])
    setTermInput('')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Activity size={17} /></span><span>tailroom</span><small>LOG VIEWER</small></div>
        <div className="topbar-actions">
          <button className="icon-button" title="Settings"><Settings2 size={18} /></button>
          <span className="divider" />
          <ProfileMenu user={session.user} onSignOut={() => void signOut()} />
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading"><span>FILES</span><button className="mini-button" onClick={openFile} title="Open log"><FileUp size={15} /></button></div>
          {fileName ? <button className="file-item active"><span className="status-dot" /><span className="file-label"><strong>{fileName}</strong><small>{lines.length.toLocaleString('pt-BR')} lines</small></span><span className="file-menu">•••</span></button> : <div className="no-file">No file selected</div>}
          {history.length > 0 && <div className="history-list"><span className="section-label">HISTORY</span>{history.map((entry) => <button className={'history-item ' + (entry.name === fileName ? 'active' : '')} key={entry.id} onClick={() => void selectHistory(entry)} title={entry.url ?? entry.name}><span className={entry.url ? 'history-icon remote' : 'history-icon'}>{entry.url ? <Globe size={12} /> : <FolderOpen size={12} />}</span><span>{entry.name}</span></button>)}</div>}
          <button className="add-file" onClick={openFile}><FolderOpen size={15} /> Open another file</button>
          <button className="add-file" onClick={() => setShowUrlInput(!showUrlInput)}><Globe size={15} /> Open from URL</button>
          {showUrlInput && <div className="url-panel"><input value={urlInput} onChange={(event) => setUrlInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void openUrl() }} placeholder="https://.../log.json" autoFocus /><button onClick={() => void openUrl()}><Globe size={13} /> Open</button></div>}
          <div className="sidebar-section"><span className="section-label">SESSION</span><div className="session-row"><span className="pulse" />{sourceUrl ? 'Remote URL active' : 'Watching active'}</div><div className="session-row muted"><RefreshCw size={13} />Polling every 1s</div></div>
          <div className="sidebar-footer"><div className="tip"><Info size={14} /><span>{sourceUrl ? 'The URL is refreshed every second.' : <>Open any <b>.log</b> or <b>.txt</b> file to begin tailing.</>}</span></div>{sourceError && <div className="source-error"><AlertTriangle size={14} />{sourceError}</div>}</div>
        </aside>

        <section className="content">
          <div className="content-head">
            <div><div className="eyebrow"><span className="live-dot" /> LIVE TAIL</div><h1>{fileName || 'Select a log source'}</h1><p>{fileName ? `${sourceUrl ? 'Remote URL' : 'Local file'} · updated ${lastUpdated}` : 'Open a local file or URL to begin'}</p></div>
            <div className="head-actions"><button className="outline-button" onClick={clearView}><Trash2 size={15} /> Clear</button><button className={'primary-button ' + (isPaused ? 'resume' : '')} onClick={() => setIsPaused(!isPaused)}>{isPaused ? <Play size={15} /> : <Pause size={15} />}{isPaused ? 'Resume' : 'Pause'}</button></div>
          </div>

          <div className="toolbar">
            <div className="term-listbox" role="listbox" aria-label="Search terms"><Search size={16} /><div className="term-chips">{searchTerms.map((term) => <span className="term-chip" key={term.id} style={{ borderColor: term.color, color: term.color }} role="option" aria-selected="true">{term.text}<button onClick={() => removeSearchTerm(term.id)} aria-label={`Remove ${term.text}`}><X size={12} /></button></span>)}<input value={termInput} onChange={(event) => setTermInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addSearchTerms(termInput) } }} onPaste={(event) => { const pasted = event.clipboardData.getData('text'); if (/[\s,]/.test(pasted.trim())) { event.preventDefault(); addSearchTerms(pasted) } }} placeholder={searchTerms.length ? 'Add another word...' : 'Add words to filter...'} /><kbd>Enter</kbd></div>{searchTerms.length > 0 && <button className="clear-search" onClick={() => setSearchTerms([])} aria-label="Clear all search terms"><X size={14} /></button>}</div>
            <button className={'toolbar-button ' + (showFilters ? 'selected' : '')} onClick={() => setShowFilters(!showFilters)}><Filter size={15} /> Filters{level !== 'ALL' && <span className="filter-count">1</span>}</button>
            <button className={'toolbar-button follow-button ' + (follow ? 'selected' : '')} onClick={() => setFollow(!follow)}><LocateFixed size={15} /> Follow</button>
            <button className="toolbar-button icon-only" title="View options" onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal size={16} /></button>
          </div>

          {showFilters && <div className="filter-panel"><div className="filter-group"><label>Level</label><div className="level-picker">{(['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'] as const).map((item) => <button key={item} className={level === item ? 'chosen ' + item.toLowerCase() : ''} onClick={() => setLevel(item)}>{level === item && <Check size={13} />}{item}</button>)}</div></div><label className="check-label"><input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} /> Case sensitive</label><label className="check-label"><input type="checkbox" checked={showLineNumbers} onChange={(event) => setShowLineNumbers(event.target.checked)} /> Line numbers</label><label className="check-label"><input type="checkbox" checked={wrapLines} onChange={(event) => setWrapLines(event.target.checked)} /> Wrap lines</label></div>}

          <div className={'log-window ' + (isDragging ? 'dragging' : '')} ref={logRef} onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={async (event) => { event.preventDefault(); setIsDragging(false); const file = event.dataTransfer.files[0]; if (file) { setIsLoading(true); try { await loadText(await file.text(), file.name); addHistory({ id: `file:${file.name}`, name: file.name }) } finally { setIsLoading(false) } } }}>
            {isDragging && <div className="drop-overlay"><FileUp size={28} /><strong>Drop log file to open</strong></div>}
            {isLoading ? <div className="loading-state"><span className="loading-spinner" /><strong>Loading log...</strong><span>Reading the selected source</span></div> : filteredLines.length === 0 ? <div className="empty-state"><Search size={25} /><strong>{fileName ? 'No lines match your filters' : 'No log loaded'}</strong><span>{fileName ? 'Try a different search or level.' : 'Open a file or URL to start tailing.'}</span></div> : filteredLines.map((line, index) => <button className={'log-line ' + (lineMatchesQuery(line.message) ? 'matched' : '')} key={line.id} onClick={() => setSelectedLine({ line, number: index + 1 })} title="Click to view the complete line"><span className="line-time">{line.timestamp}</span>{showLineNumbers && <span className="line-number">{String(index + 1).padStart(4, '0')}</span>}<span className={'line-level ' + levelClass[line.level]}>{line.level}</span><span className={'line-message ' + (wrapLines ? 'wrapped' : '')}>{highlightMessage(line.message)}</span></button>)}
          </div>
          <footer className="statusbar"><span><span className="green-dot" />{isLoading ? 'Loading' : isPaused ? 'Paused' : fileName ? 'Watching' : 'Idle'} {fileName && <b>{fileName}</b>}</span><span>{filteredLines.length.toLocaleString('pt-BR')} visible <i>·</i> {lines.length.toLocaleString('pt-BR')} total</span><span className="status-shortcuts"><kbd>Space</kbd> {isPaused ? 'resume' : 'pause'} <i>·</i> <kbd>F</kbd> follow</span></footer>
        </section>
      </section>
      {selectedLine && <div className="line-modal-backdrop" role="presentation" onClick={() => setSelectedLine(null)}><section className="line-modal" role="dialog" aria-modal="true" aria-labelledby="line-modal-title" onClick={(event) => event.stopPropagation()}><header className="line-modal-header"><div><span className="modal-kicker">FULL LOG LINE</span><h2 id="line-modal-title">Line {String(selectedLine.number).padStart(4, '0')}</h2></div><button className="modal-close" onClick={() => setSelectedLine(null)} aria-label="Close full line"><X size={18} /></button></header><div className="line-modal-meta"><span>{selectedLine.line.timestamp}</span><span className={'line-level ' + levelClass[selectedLine.line.level]}>{selectedLine.line.level}</span><span>{fileName}</span></div><pre className="line-modal-text">{highlightMessage(selectedLine.line.message)}</pre></section></div>}
      <input ref={inputRef} className="hidden-input" type="file" accept=".log,.txt,text/plain" onChange={handleFallbackFile} />
    </main>
  )
}

export default App
