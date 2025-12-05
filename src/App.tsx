import { useEffect, useState } from 'react'
import './App.css'

type SurveyStructure = {
  id: number
  titulo: string
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

  useEffect(() => {
    const handlePopstate = () => {
      const match = window.location.pathname.match(/\/surveys\/(\d+)/)
      setSurveyId(match ? Number(match[1]) : null)
      setSelectedOptions({})
      setVoteResults([])
      setErrorMessage(null)
      setErrorDetails(null)
      setErrorStatus(null)
    }

    window.addEventListener('popstate', handlePopstate)
    return () => window.removeEventListener('popstate', handlePopstate)
  }, [])

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

      try {
        const data = await apiFetch<SurveyStructure>(
          `/api/surveys/${surveyId}/structure?includeInactiveOptions=false`,
        )
        const isActive =
          data.ativo === true || data.ativo === 1 || data.ativo === '1'

        if (!isActive) {
          setStructure(null)
          setErrorMessage('Esta pesquisa não está ativa.')
          setErrorDetails(null)
          setErrorStatus(null)
          return
        }
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
      return
    }

    setSubmitting(true)
    setErrorMessage(null)
    setErrorDetails(null)
    setVoteResults([])

    try {
      const responses: VoteResponse[] = []

      for (const question of structure.questions) {
        const optionId = selectedOptions[question.id]
        const result = await apiFetch<VoteResponse>('/api/votes', {
          method: 'POST',
          body: JSON.stringify({
            surveyId: structure.id,
            questionId: question.id,
            optionId,
          }),
        })
        responses.push(result)
      }

      setVoteResults(responses)
    } catch (error) {
      const err = error as ApiError
      if (err.status === 429) {
        setErrorMessage('Muitas requisições. Tente novamente em 1 minuto.')
      } else {
        setErrorMessage(err.message || 'Não foi possível registrar seu voto.')
      }
      setErrorDetails(err.details || null)
      setErrorStatus(err.status ?? null)
    } finally {
      setSubmitting(false)
    }
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
        <p className="lede">
          Você está respondendo uma pesquisa pública. Escolha a opção que mais representa sua experiência e registre seu voto.
        </p>
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
                    <div key={question.id} className="question-block">
                      <p className="question-title">{question.texto}</p>
                      <div className="option-list">
                        {question.options.map((option) => (
                          <label key={option.id} className="option">
                            <input
                            type="radio"
                              name={`vote-option-${question.id}`}
                              value={option.id}
                              checked={selectedOptions[question.id] === option.id}
                              onChange={() => {
                                setSelectedOptions((prev) => ({
                                  ...prev,
                                  [question.id]: option.id,
                                }))
                                setVoteResults([])
                                setErrorMessage(null)
                                setErrorDetails(null)
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
                    structure.questions.length === 0 ||
                    structure.questions.some(
                      (question) => !selectedOptions[question.id],
                    )
                  }
                >
                  {submitting ? 'Enviando voto...' : 'Enviar voto'}
                </button>
              </div>
            </>
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
            <div className="feedback error">
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
