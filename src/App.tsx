import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  Activity,
  AlertTriangle,
  Check,
  FileUp,
  Filter,
  FolderOpen,
  Globe,
  Info,
  KeyRound,
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
  Trash2,
  X,
} from 'lucide-react'
import type { AuthError, Session, User } from '@supabase/supabase-js'
import { isRecoveryRedirect, isSupabaseConfigured, supabase } from './lib/supabase'
import { defaultSettings, deleteSource, loadSettings, loadSources, saveSettings, saveSource, type Level, type UserSettings } from './lib/userData'

type LogLine = { id: number; timestamp: string; level: Level; message: string }
type SearchTerm = { id: string; text: string; color: string }
// Fonte aberta na sessão: URL remota, arquivo com handle (live tail) ou File comum (drag-and-drop / fallback).
type OpenSource = { id: string; name: string; url?: string; handle?: FileSystemFileHandle; file?: File }
// URL salva na conta do usuário (tabela log_sources).
type SavedUrl = { id?: string; name: string; url: string }
type AuthMode = 'signin' | 'signup' | 'forgot'

const termColors = ['#f2b56b', '#77d6b1', '#91b6f2', '#e894a8', '#c9a4e8', '#e8d56e']

const levelClass: Record<Level, string> = { INFO: 'info', WARN: 'warn', ERROR: 'error', DEBUG: 'debug' }

const minPasswordLength = 8

function authErrorMessage(error: AuthError) {
  switch (error.code) {
    case 'invalid_credentials': return 'E-mail ou senha incorretos.'
    case 'email_not_confirmed': return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'
    case 'user_already_exists':
    case 'email_exists': return 'Já existe uma conta com este e-mail.'
    case 'weak_password': return `Senha fraca. Use pelo menos ${minPasswordLength} caracteres, misturando letras e números.`
    case 'same_password': return 'A nova senha precisa ser diferente da atual.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
    case 'signup_disabled': return 'O cadastro de novas contas está desativado.'
    default: return error.message || 'Não foi possível concluir a operação.'
  }
}

function AuthScreen({ onGoogleSignIn }: { onGoogleSignIn: () => void }) {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function switchMode(next: AuthMode) {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setError('')
    setNotice('')
    setIsBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setError(authErrorMessage(error))
      } else if (mode === 'signup') {
        if (password.length < minPasswordLength) {
          setError(`A senha precisa ter pelo menos ${minPasswordLength} caracteres.`)
          return
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name.trim() || undefined } },
        })
        if (error) setError(authErrorMessage(error))
        else if (!data.session) {
          setNotice('Enviamos um link de confirmação para o seu e-mail. Confirme para entrar.')
          setMode('signin')
          setPassword('')
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) setError(authErrorMessage(error))
        else setNotice('Se houver uma conta com este e-mail, você receberá um link para redefinir a senha.')
      }
    } finally {
      setIsBusy(false)
    }
  }

  function signInWithGoogle() {
    setIsBusy(true)
    onGoogleSignIn()
  }

  const submitLabel = mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link de redefinição'

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand"><span className="brand-mark"><Activity size={17} /></span><strong>tailroom</strong></div>
        <div className="auth-icon"><ShieldCheck size={25} /></div>
        <span className="auth-kicker">PRIVATE LOG WORKSPACE</span>
        <h1>{mode === 'signup' ? 'Crie sua conta.' : mode === 'forgot' ? 'Recupere seu acesso.' : 'Seus logs, sob seu controle.'}</h1>
        <p className="auth-copy">{mode === 'forgot' ? 'Informe o e-mail da sua conta para receber um link de redefinição de senha.' : 'Entre com Google ou e-mail para acessar seu espaço de trabalho com uma sessão protegida.'}</p>
        {mode !== 'forgot' && <>
          <button className="google-button" onClick={signInWithGoogle} disabled={isBusy || !isSupabaseConfigured}><Mail size={17} />Continuar com Google</button>
          <div className="auth-divider"><span>ou com e-mail</span></div>
        </>}
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          {mode === 'signup' && <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Como devemos te chamar" /></label>}
          <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="voce@empresa.com" required /></label>
          {mode !== 'forgot' && <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? minPasswordLength : undefined} required /></label>}
          <button className="auth-submit" type="submit" disabled={isBusy || !isSupabaseConfigured}>{isBusy ? 'Aguarde...' : submitLabel}</button>
        </form>
        {error && <p className="auth-error">{error}</p>}
        {notice && <p className="auth-notice">{notice}</p>}
        <div className="auth-links">
          {mode === 'signin' && <><button onClick={() => switchMode('forgot')}>Esqueci minha senha</button><button onClick={() => switchMode('signup')}>Criar conta</button></>}
          {mode !== 'signin' && <button onClick={() => switchMode('signin')}>Já tenho conta · Entrar</button>}
        </div>
        {!isSupabaseConfigured && <p className="auth-warning">Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para ativar o login.</p>}
        <div className="auth-security"><ShieldCheck size={14} /><span>Sessão renovada automaticamente · dados isolados por usuário</span></div>
      </section>
    </main>
  )
}

function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    if (password.length < minPasswordLength) return setError(`A senha precisa ter pelo menos ${minPasswordLength} caracteres.`)
    if (password !== confirmation) return setError('As senhas não conferem.')
    setError('')
    setIsBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setIsBusy(false)
    if (error) setError(authErrorMessage(error))
    else onDone()
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand"><span className="brand-mark"><Activity size={17} /></span><strong>tailroom</strong></div>
        <div className="auth-icon"><KeyRound size={25} /></div>
        <span className="auth-kicker">NOVA SENHA</span>
        <h1>Defina uma nova senha.</h1>
        <p className="auth-copy">Escolha uma senha com pelo menos {minPasswordLength} caracteres.</p>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <label>Nova senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={minPasswordLength} required autoFocus /></label>
          <label>Confirmar senha<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={minPasswordLength} required /></label>
          <button className="auth-submit" type="submit" disabled={isBusy}>{isBusy ? 'Salvando...' : 'Salvar nova senha'}</button>
        </form>
        {error && <p className="auth-error">{error}</p>}
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

function toSearchTerms(values: string[], offset = 0): SearchTerm[] {
  return values.map((text, index) => ({ id: `${Date.now()}-${offset + index}`, text, color: termColors[(offset + index) % termColors.length] }))
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured)
  const [authError, setAuthError] = useState('')
  const [isRecovering, setIsRecovering] = useState(isRecoveryRedirect)

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
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecovering(true)
      if (event === 'SIGNED_OUT') setIsRecovering(false)
      setSession(nextSession)
      setAuthReady(true)
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
  if (session && isRecovering) return <ResetPasswordScreen onDone={() => setIsRecovering(false)} />
  if (!session) return <><AuthScreen onGoogleSignIn={() => void signInWithGoogle()} />{authError && <div className="auth-toast">{authError}</div>}</>
  // key: ao trocar de usuário o workspace é recriado, sem herdar estado do anterior.
  return <LogWorkspace key={session.user.id} user={session.user} onSignOut={() => void signOut()} />
}

function LogWorkspace({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [fileName, setFileName] = useState('')
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [sourceError, setSourceError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [follow, setFollow] = useState(defaultSettings.follow)
  const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([])
  const [termInput, setTermInput] = useState('')
  const [openSources, setOpenSources] = useState<OpenSource[]>([])
  const [activeId, setActiveId] = useState('')
  const [savedUrls, setSavedUrls] = useState<SavedUrl[]>([])
  const [level, setLevel] = useState<'ALL' | Level>(defaultSettings.level)
  const [caseSensitive, setCaseSensitive] = useState(defaultSettings.case_sensitive)
  const [showLineNumbers, setShowLineNumbers] = useState(defaultSettings.show_line_numbers)
  const [wrapLines, setWrapLines] = useState(defaultSettings.wrap_lines)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('live')
  const [isDragging, setIsDragging] = useState(false)
  const [selectedLine, setSelectedLine] = useState<{ line: LogLine; number: number } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastSizeRef = useRef(0)
  const lastRemoteTextRef = useRef('')

  // Carrega as preferências e as URLs salvas do usuário logado.
  useEffect(() => {
    let active = true
    void Promise.all([loadSettings(), loadSources()]).then(([settings, sources]) => {
      if (!active) return
      setLevel(settings.level)
      setCaseSensitive(settings.case_sensitive)
      setShowLineNumbers(settings.show_line_numbers)
      setWrapLines(settings.wrap_lines)
      setFollow(settings.follow)
      setSearchTerms(toSearchTerms(settings.search_terms))
      setSavedUrls(sources.map(({ id, name, url }) => ({ id, name, url })))
    }).catch(() => {
      if (active) setSyncError('Não foi possível carregar seus dados salvos.')
    }).finally(() => {
      if (active) setSettingsLoaded(true)
    })
    return () => { active = false }
  }, [])

  // Salva as preferências (com debounce) depois do carregamento inicial.
  useEffect(() => {
    if (!settingsLoaded) return
    const settings: UserSettings = { level, case_sensitive: caseSensitive, show_line_numbers: showLineNumbers, wrap_lines: wrapLines, follow, search_terms: searchTerms.map((term) => term.text) }
    const timer = window.setTimeout(() => {
      saveSettings(user.id, settings).then(() => setSyncError('')).catch(() => setSyncError('Não foi possível salvar suas preferências.'))
    }, 600)
    return () => window.clearTimeout(timer)
  }, [settingsLoaded, user.id, level, caseSensitive, showLineNumbers, wrapLines, follow, searchTerms])

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

  function addSearchTerms(value: string) {
    const values = value.split(/[\s,]+/).map((term) => term.trim()).filter(Boolean)
    if (!values.length) return
    setSearchTerms((current) => {
      const existing = new Set(current.map((term) => term.text.toLowerCase()))
      return [...current, ...toSearchTerms(values.filter((term) => !existing.has(term.toLowerCase())), current.length)]
    })
    setTermInput('')
  }

  function removeSearchTerm(id: string) {
    setSearchTerms((current) => current.filter((term) => term.id !== id))
  }

  function addOpenSource(source: OpenSource) {
    setOpenSources((current) => current.some((item) => item.id === source.id) ? current : [...current, source])
    setActiveId(source.id)
  }

  async function findOpenHandle(handle: FileSystemFileHandle) {
    for (const source of openSources) {
      if (source.handle && await source.handle.isSameEntry(handle)) return source
    }
    return undefined
  }

  function rememberUrl(name: string, url: string) {
    setSavedUrls((current) => [{ ...current.find((item) => item.url === url), name, url }, ...current.filter((item) => item.url !== url)])
    saveSource(user.id, name, url)
      .then((id) => setSavedUrls((current) => current.map((item) => item.url === url ? { ...item, id } : item)))
      .catch(() => setSyncError('Não foi possível salvar a URL no seu histórico.'))
  }

  async function removeSavedUrl(saved: SavedUrl) {
    setSavedUrls((current) => current.filter((item) => item.url !== saved.url))
    if (!saved.id) return
    try {
      await deleteSource(saved.id)
    } catch {
      setSyncError('Não foi possível remover a URL do seu histórico.')
    }
  }

  async function showLocalFile(source: OpenSource) {
    setIsLoading(true)
    try {
      const file = source.handle ? await source.handle.getFile() : source.file
      if (!file) return
      await loadText(await file.text(), file.name)
      setFileHandle(source.handle ?? null)
      setSourceUrl('')
      setSourceError('')
      lastSizeRef.current = file.size
      addOpenSource(source)
    } catch (error) {
      setSourceError(`Não foi possível abrir o arquivo: ${error instanceof Error ? error.message : 'erro desconhecido'}`)
    } finally {
      setIsLoading(false)
    }
  }

  async function showUrl(url: string, name = getRemoteName(url)) {
    setIsLoading(true)
    try {
      setSourceError('')
      const response = await fetch(getRemoteRequestUrl(url), { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = await response.text()
      lastRemoteTextRef.current = text
      await loadText(text, name)
      setFileHandle(null)
      setSourceUrl(url)
      setUrlInput(url)
      setShowUrlInput(false)
      addOpenSource({ id: `url:${url}`, name, url })
      rememberUrl(name, url)
    } catch (error) {
      setSourceError(`Não foi possível abrir a URL: ${error instanceof Error ? error.message : 'erro desconhecido'}. Verifique o endereço ou o CORS.`)
    } finally {
      setIsLoading(false)
    }
  }

  function openPlainFile(file: File) {
    return showLocalFile({ id: `file:${file.name}:${file.size}:${file.lastModified}`, name: file.name, file })
  }

  function selectSource(source: OpenSource) {
    if (source.id === activeId) return
    return source.url ? showUrl(source.url, source.name) : showLocalFile(source)
  }

  function closeSource(source: OpenSource) {
    const index = openSources.findIndex((item) => item.id === source.id)
    const remaining = openSources.filter((item) => item.id !== source.id)
    setOpenSources(remaining)
    if (source.id !== activeId) return
    const next = remaining[Math.min(index, remaining.length - 1)]
    if (next) void selectSource(next)
    else resetView()
  }

  function resetView() {
    setLines([])
    setFileName('')
    setFileHandle(null)
    setSourceUrl('')
    setSourceError('')
    setActiveId('')
    setLastUpdated('live')
  }

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

  function getRemoteName(url: string) {
    try {
      return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || new URL(url).hostname)
    } catch {
      return 'remote-log'
    }
  }

  async function openFile() {
    if (!('showOpenFilePicker' in window)) {
      inputRef.current?.click()
      return
    }
    const picker = (window as Window & { showOpenFilePicker: (options?: object) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker
    let handle: FileSystemFileHandle
    try {
      [handle] = await picker({ types: [{ description: 'Log files', accept: { 'text/plain': ['.log', '.txt'] } }] })
    } catch {
      return // Seletor cancelado pelo usuário.
    }
    const existing = await findOpenHandle(handle)
    await showLocalFile(existing ?? { id: `file:${crypto.randomUUID()}`, name: handle.name, handle })
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
    await showUrl(url)
  }

  async function handleFallbackFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // Permite selecionar o mesmo arquivo de novo.
    if (file) await openPlainFile(file)
  }

  function clearView() {
    setLines([])
    setLastUpdated('cleared')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Activity size={17} /></span><span>tailroom</span><small>LOG VIEWER</small></div>
        <div className="topbar-actions">
          <button className="icon-button" title="Settings"><Settings2 size={18} /></button>
          <span className="divider" />
          <ProfileMenu user={user} onSignOut={onSignOut} />
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading"><span>FILES</span><button className="mini-button" onClick={openFile} title="Open log"><FileUp size={15} /></button></div>
          {openSources.length > 0 ? <div className="open-files">{openSources.map((source) => {
            const active = source.id === activeId
            return <div className={'file-row ' + (active ? 'active' : '')} key={source.id}><button className={'file-item ' + (active ? 'active' : '')} onClick={() => void selectSource(source)} title={source.url ?? source.name}>{active ? <span className="status-dot" /> : <span className={source.url ? 'history-icon remote' : 'history-icon'}>{source.url ? <Globe size={12} /> : <FolderOpen size={12} />}</span>}<span className="file-label"><strong>{source.name}</strong><small>{active ? `${lines.length.toLocaleString('pt-BR')} lines` : source.url ? 'Remote URL' : 'Local file'}</small></span></button><button className="file-close" onClick={() => closeSource(source)} aria-label={`Close ${source.name}`} title="Close"><X size={12} /></button></div>
          })}</div> : <div className="no-file">No file selected</div>}
          {savedUrls.some((saved) => !openSources.some((source) => source.url === saved.url)) && <div className="history-list"><span className="section-label">HISTORY</span>{savedUrls.filter((saved) => !openSources.some((source) => source.url === saved.url)).map((saved) => <div className="history-row" key={saved.url}><button className="history-item" onClick={() => void showUrl(saved.url, saved.name)} title={saved.url}><span className="history-icon remote"><Globe size={12} /></span><span>{saved.name}</span></button><button className="history-remove" onClick={() => void removeSavedUrl(saved)} aria-label={`Remove ${saved.name} from history`} title="Remove from history"><X size={11} /></button></div>)}</div>}
          <button className="add-file" onClick={openFile}><FolderOpen size={15} /> Open another file</button>
          <button className="add-file" onClick={() => setShowUrlInput(!showUrlInput)}><Globe size={15} /> Open from URL</button>
          {showUrlInput && <div className="url-panel"><input value={urlInput} onChange={(event) => setUrlInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void openUrl() }} placeholder="https://.../log.json" autoFocus /><button onClick={() => void openUrl()}><Globe size={13} /> Open</button></div>}
          <div className="sidebar-section"><span className="section-label">SESSION</span><div className="session-row"><span className="pulse" />{sourceUrl ? 'Remote URL active' : 'Watching active'}</div><div className="session-row muted"><RefreshCw size={13} />Polling every 1s</div></div>
          <div className="sidebar-footer"><div className="tip"><Info size={14} /><span>{sourceUrl ? 'The URL is refreshed every second.' : <>Open any <b>.log</b> or <b>.txt</b> file to begin tailing.</>}</span></div>{sourceError && <div className="source-error"><AlertTriangle size={14} />{sourceError}</div>}{syncError && <div className="source-error"><AlertTriangle size={14} />{syncError}</div>}</div>
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

          <div className={'log-window ' + (isDragging ? 'dragging' : '')} ref={logRef} onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={async (event) => { event.preventDefault(); setIsDragging(false); for (const file of Array.from(event.dataTransfer.files)) await openPlainFile(file) }}>
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
