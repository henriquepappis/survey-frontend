import { useEffect, useRef, useState } from 'react'
import './App.css'

type SurveyStructure = {
  id: number
  titulo: string
  descricao?: string | null
  description?: string | null
  ativo: boolean
  dataValidade?: string | null
  questions: Question[]
}

type Question = {
  id: number
  texto: string
  ordem: number
  options: Option[]
}

type Option = {
  id: number
  texto: string
  ativo: boolean
}

type VoteResponse = {
  voteId: number
  sessionId?: number
  antifraudToken?: string
}

type VotePayload = {
  surveyId: number
  questionId: number
  optionId: number
  source?: string | null
  country?: string | null
  state?: string | null
  city?: string | null
  deviceType?: string | null
  operatingSystem?: string | null
  browser?: string | null
  status?: 'COMPLETED'
  startedAt?: string
  completedAt?: string
}

type ApiError = {
  status?: number
  message: string
  details?: string | null
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || ''

const buildUrl = (path: string) => {
  const base = API_BASE_URL.replace(/\/$/, '')
  return `${base}${path}`
}

const SOURCE_STORAGE_KEY = 'survey-source-context'

const getSourceParam = () => {
  const params = new URLSearchParams(window.location.search)
  return params.get('source') || params.get('utm_source')
}

const getGeoParams = () => {
  const params = new URLSearchParams(window.location.search)
  return {
    country: params.get('country'),
    state: params.get('state'),
    city: params.get('city'),
  }
}

const getStoredSourceContext = (): Partial<VotePayload> | null => {
  try {
    const raw = localStorage.getItem(SOURCE_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<VotePayload>
  } catch {
    return null
  }
}

const persistSourceContext = (context: Partial<VotePayload>) => {
  try {
    localStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(context))
  } catch {
    // best effort only
  }
}

const mapApiErrorMessage = (error: ApiError): ApiError => {
  const normalized = (error.message || '').toLowerCase()
  if (error.status === 429) {
    return { ...error, message: 'Muitas requisições. Tente novamente em 1 minuto.' }
  }
  if (normalized.includes('já recebemos um voto') || error.status === 409) {
    return { ...error, message: 'Você já votou recentemente nesta pesquisa neste dispositivo.' }
  }
  if (normalized.includes('expirada')) {
    return { ...error, message: 'Esta pesquisa expirou.' }
  }
  return error
}

const getDeviceContext = () => {
  const ua = navigator.userAgent || ''
  const isMobile = /Mobi|Android/i.test(ua)
  const deviceType = isMobile ? 'mobile' : 'desktop'

  let operatingSystem: string | null = null
  if (/Android/i.test(ua)) operatingSystem = 'Android'
  else if (/iPhone|iPad|iPod/i.test(ua)) operatingSystem = 'iOS'
  else if (/Windows/i.test(ua)) operatingSystem = 'Windows'
  else if (/Mac OS X/i.test(ua)) operatingSystem = 'macOS'
  else if (/Linux/i.test(ua)) operatingSystem = 'Linux'

  let browser: string | null = null
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua) && !/OPR\//i.test(ua)) browser = 'Chrome'
  else if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/Safari/i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/OPR\//i.test(ua)) browser = 'Opera'

  return { deviceType, operatingSystem, browser }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(buildUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const body =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
    const rawMessage = typeof body?.message === 'string' ? body.message : null
    const message =
      response.status === 404
        ? 'Pesquisa não encontrada ou expirada.'
        : rawMessage || 'Não foi possível completar a ação.'

    const details =
      typeof body?.details === 'string'
        ? body.details
        : Array.isArray(body?.details)
          ? body.details.join(' | ')
          : null

    const error: ApiError = {
      status: response.status,
      message,
      details,
    }
    throw error
  }

  return payload as T
}

function App() {
  const [surveyId, setSurveyId] = useState<number | null>(() => {
    const match = window.location.pathname.match(/\/surveys\/(\d+)/)
    return match ? Number(match[1]) : null
  })
  const [structure, setStructure] = useState<SurveyStructure | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number>>(
    {},
  )
  const [structureLoading, setStructureLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [voteResults, setVoteResults] = useState<VoteResponse[]>([])
  const voteStartedAtRef = useRef<Date | null>(null)
  const [missingQuestionIds, setMissingQuestionIds] = useState<number[]>([])
  const [showThankYou, setShowThankYou] = useState(false)
  const thankYouFocusRef = useRef<HTMLHeadingElement | null>(null)
  const errorRef = useRef<HTMLDivElement | null>(null)

  const heroDescription =
    (structure?.descricao || structure?.description || '')?.trim() ||
    'Você está respondendo uma pesquisa pública. Escolha a opção que mais representa sua experiência e registre seu voto.'
  const storedSourceContext = getStoredSourceContext()
  const firstMissingInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const handlePopstate = () => {
      const match = window.location.pathname.match(/\/surveys\/(\d+)/)
      setSurveyId(match ? Number(match[1]) : null)
      setSelectedOptions({})
      setVoteResults([])
      setErrorMessage(null)
      setErrorDetails(null)
      setErrorStatus(null)
      voteStartedAtRef.current = null
      setMissingQuestionIds([])
      setShowThankYou(false)
    }

    window.addEventListener('popstate', handlePopstate)
    return () => window.removeEventListener('popstate', handlePopstate)
  }, [])

  useEffect(() => {
    if (missingQuestionIds.length === 0) return
    const firstId = missingQuestionIds[0]
    const firstInput = document.querySelector<HTMLInputElement>(
      `input[name=\"vote-option-${firstId}\"]`,
    )
    if (firstInput) {
      firstInput.focus()
      firstMissingInputRef.current = firstInput
    }
  }, [missingQuestionIds])

  useEffect(() => {
    if (errorMessage && errorRef.current) {
      errorRef.current.focus()
    }
  }, [errorMessage])

  useEffect(() => {
    if (showThankYou && thankYouFocusRef.current) {
      thankYouFocusRef.current.focus()
    }
  }, [showThankYou])

  useEffect(() => {
    const fetchStructure = async () => {
      if (!surveyId) {
        setStructure(null)
        setErrorMessage('URL da pesquisa não informada. Use /surveys/{id}.')
        setErrorStatus(null)
        return
      }

      setStructureLoading(true)
      setStructure(null)
      setSelectedOptions({})
      setErrorMessage(null)
      setErrorDetails(null)
      setErrorStatus(null)
      setVoteResults([])
      setMissingQuestionIds([])
      setShowThankYou(false)
      setShowThankYou(false)

      try {
        const data = await apiFetch<SurveyStructure>(
          `/api/surveys/${surveyId}/structure?includeInactiveOptions=false`,
        )
        const isActive = data.ativo === true

        if (!isActive) {
          setStructure(null)
          setErrorMessage('Esta pesquisa não está ativa.')
          setErrorDetails(null)
          setErrorStatus(null)
          return
        }
        voteStartedAtRef.current = new Date()
        setStructure(data)
      } catch (error) {
        const err = error as ApiError
        setErrorMessage(
          err.message || 'Não foi possível carregar a pesquisa selecionada.',
        )
        setErrorDetails(err.details || null)
        setErrorStatus(err.status ?? null)
      } finally {
        setStructureLoading(false)
      }
    }

    fetchStructure()
  }, [surveyId])

  const handleVote = async () => {
    if (!structure || !surveyId) {
      setErrorMessage('Selecione uma pergunta e uma opção para votar.')
      setErrorDetails(null)
      setErrorStatus(null)
      return
    }

    const unanswered = structure.questions.filter(
      (question) => !selectedOptions[question.id],
    )
    if (unanswered.length > 0) {
      setErrorMessage('Responda todas as perguntas para enviar seu voto.')
      setErrorDetails(null)
      setErrorStatus(null)
      setMissingQuestionIds(unanswered.map((question) => question.id))
      return
    }

    setSubmitting(true)
    setErrorMessage(null)
    setErrorDetails(null)
    setVoteResults([])
    setMissingQuestionIds([])
    setShowThankYou(false)

    try {
      const responses: VoteResponse[] = []
      const source = getSourceParam() || storedSourceContext?.source || null
      const geo = {
        country: getGeoParams().country || storedSourceContext?.country || null,
        state: getGeoParams().state || storedSourceContext?.state || null,
        city: getGeoParams().city || storedSourceContext?.city || null,
      }
      const device = {
        deviceType: getDeviceContext().deviceType || storedSourceContext?.deviceType || null,
        operatingSystem: getDeviceContext().operatingSystem || storedSourceContext?.operatingSystem || null,
        browser: getDeviceContext().browser || storedSourceContext?.browser || null,
      }
      const startedAtIso = (voteStartedAtRef.current || new Date()).toISOString()
      const completedAtIso = new Date().toISOString()

      for (const question of structure.questions) {
        const optionId = selectedOptions[question.id]
        const payload: VotePayload = {
          surveyId: structure.id,
          questionId: question.id,
          optionId,
          source,
          ...geo,
          ...device,
          status: 'COMPLETED',
          startedAt: startedAtIso,
          completedAt: completedAtIso,
        }

        console.debug('Enviando voto', payload)
        const result = await apiFetch<VoteResponse>('/api/votes', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        responses.push(result)
      }

      persistSourceContext({ source, ...geo, ...device })
      setVoteResults(responses)
      setShowThankYou(true)
    } catch (error) {
      const err = mapApiErrorMessage(error as ApiError)
      setErrorMessage(err.message || 'Não foi possível registrar seu voto.')
      setErrorDetails(err.details || null)
      setErrorStatus(err.status ?? null)
    } finally {
      setSubmitting(false)
    }
  }

  if (showThankYou) {
    return (
      <div className="thank-you-page">
        <div className="thank-you-card">
          <p className="eyebrow">Obrigado!</p>
          <h1 ref={thankYouFocusRef} tabIndex={-1}>Seu voto foi registrado com sucesso.</h1>
          <p className="lede">
            Agradecemos por participar da pesquisa. Sua opinião ajuda a melhorar nossos serviços.
          </p>
          <div className="thank-you-actions">
            <button type="button" onClick={() => window.location.reload()}>
              Responder outra pesquisa
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (errorStatus === 404) {
    return (
      <div className="page not-found">
        <div className="not-found-card">
          <p className="eyebrow">404</p>
          <h1>Pesquisa não encontrada ou expirada.</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Pesquisa de satisfação</p>
        <h1>{structure?.titulo || 'Participe e compartilhe sua opinião'}</h1>
        <p className="lede">{heroDescription}</p>
      </header>

      <main className="content">
        <section className="card">
          <div className="section-header">
            <div>
              <p className="eyebrow">Passo único</p>
              <h2>Responda à pergunta</h2>
            </div>
            {structureLoading && <span className="chip">Carregando...</span>}
          </div>

          {structure && (
            <>
              {structure.questions.length === 0 && (
                <p>Esta pesquisa não possui perguntas ativas no momento.</p>
              )}

              {structure.questions.length > 0 && (
                <div className="questions">
                  {structure.questions.map((question) => (
                    <div
                      key={question.id}
                      className={`question-block${
                        missingQuestionIds.includes(question.id) ? ' missing' : ''
                      }`}
                      role="group"
                      aria-labelledby={`question-${question.id}`}
                      aria-invalid={missingQuestionIds.includes(question.id)}
                      aria-describedby={
                        missingQuestionIds.includes(question.id)
                          ? `question-${question.id}-warning`
                          : undefined
                      }
                    >
                      <p className="question-title" id={`question-${question.id}`}>
                        {question.texto}
                        {missingQuestionIds.includes(question.id) && (
                          <span
                            className="question-warning"
                            id={`question-${question.id}-warning`}
                          >
                            Obrigatória
                          </span>
                        )}
                      </p>
                      <div className="option-list">
                        {question.options.map((option) => (
                          <label key={option.id} className="option">
                            <input
                            type="radio"
                              name={`vote-option-${question.id}`}
                              value={option.id}
                              checked={selectedOptions[question.id] === option.id}
                              aria-invalid={missingQuestionIds.includes(question.id)}
                              onChange={() => {
                                setSelectedOptions((prev) => ({
                                  ...prev,
                                  [question.id]: option.id,
                                }))
                                setVoteResults([])
                                setErrorMessage(null)
                                setErrorDetails(null)
                                setMissingQuestionIds((prev) =>
                                  prev.filter((id) => id !== question.id),
                                )
                              }}
                            />
                            <span>{option.texto}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="actions">
                <button
                  type="button"
                  onClick={handleVote}
                  disabled={
                    submitting ||
                    !structure ||
                    structure.questions.length === 0
                  }
                >
                  {submitting ? 'Enviando voto...' : 'Enviar voto'}
                </button>
              </div>
            </>
          )}

          {structureLoading && !structure && (
            <div className="questions skeleton-questions" aria-busy="true">
              {[1, 2, 3].map((item) => (
                <div key={item} className="question-block skeleton">
                  <div className="skeleton-line short" />
                  <div className="option-list">
                    {[1, 2].map((opt) => (
                      <div key={opt} className="option skeleton-option">
                        <div className="skeleton-circle" />
                        <div className="skeleton-line" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {voteResults.length > 0 && (
            <div className="feedback success">
              <p>Votos registrados com sucesso!</p>
              <ul>
                {voteResults.map((result, index) => (
                  <li key={result.voteId}>
                    <strong>Pergunta {index + 1}:</strong> voto {result.voteId}
                    {result.sessionId && ` · sessão ${result.sessionId}`}
                    {result.antifraudToken && ` · token ${result.antifraudToken}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {errorMessage && (
            <div
              className="feedback error"
              role="alert"
              aria-live="assertive"
              tabIndex={-1}
              ref={errorRef}
            >
              <p>{errorMessage}</p>
              {errorDetails && <small>{errorDetails}</small>}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
