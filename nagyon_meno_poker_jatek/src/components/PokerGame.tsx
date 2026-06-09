import { useEffect, useState } from 'react'
import './PokerGame.css'
import { newDeck, draw } from './deckApi'
import { evaluateBestHand, compareHand } from './handEvaluator'

type Card = { image: string; value: string; suit: string }

type Player = {
  id: number
  name: string
  chips: number
  cards: Card[]
  isCpu: boolean
  folded: boolean
  currentBet: number
  bonusCardNextRound?: boolean
  revealed?: boolean
}

export default function PokerGame() {
  const [players, setPlayers] = useState<Player[]>([])
  const [numCpu, setNumCpu] = useState(2)
  const [ante, setAnte] = useState(10)
  const [pot, setPot] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [community, setCommunity] = useState<Card[]>([])
  const [deckId, setDeckId] = useState<string | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<number | null>(null)
  const [dealerIndex, setDealerIndex] = useState(0)
  const [currentBetToCall, setCurrentBetToCall] = useState(0)
  const playersToActRef = { current: 0 }
  const [raiseInput, setRaiseInput] = useState(10)
  const [stage, setStage] = useState<'idle'|'preflop'|'flop'|'turn'|'river'|'showdown'>('idle')
  const smallBlind = 5
  const bigBlind = 10
  const [phaseCount, setPhaseCount] = useState(0)
  const [showdownAvailable, setShowdownAvailable] = useState(false)

  useEffect(() => {
    const initial: Player[] = [{ id: 0, name: 'You', chips: 500, cards: [], isCpu: false, folded: false, currentBet: 0, bonusCardNextRound: false }]
    setPlayers(initial)
  }, [])

  useEffect(() => {
    if (currentPlayer == null) return
    const p = players[currentPlayer]
    if (!p) return
    if (p.isCpu && !p.folded) {
      const t = setTimeout(() => cpuAct(currentPlayer), 700 + Math.random() * 800)
      return () => clearTimeout(t)
    }
  }, [currentPlayer, players])

  function rankValue(card: Card) {
    const r = card.value
    if (r === 'ACE') return 14
    if (r === 'KING') return 13
    if (r === 'QUEEN') return 12
    if (r === 'JACK') return 11
    return parseInt(r, 10)
  }

  async function startRound() {
    setMessage(null)
    setRunning(true)

    const basePlayers: Player[] = []
    const existing = players.length ? players : [{ id: 0, name: 'You', chips: 500, cards: [], isCpu: false, folded: false, currentBet: 0 }]
    basePlayers.push({ ...existing[0], cards: [], folded: false, currentBet: 0 })
    for (let i = 0; i < numCpu; i++) {
      const existingCpu = existing.find(p => p.id === i + 1)
      basePlayers.push({ id: i + 1, name: `CPU ${i + 1}`, chips: existingCpu ? existingCpu.chips : 500, cards: [], isCpu: true, folded: false, currentBet: 0 })
    }
    setPlayers(basePlayers)

  const d = await newDeck(true, 1)
  setDeckId(d.deck_id)

    const holeCounts = basePlayers.map(p => p.bonusCardNextRound ? 3 : 2)
    const totalHole = holeCounts.reduce((s, v) => s + v, 0)
    const drawCount = totalHole + 3
    const drawn = await draw(d.deck_id, drawCount)
    const cards = drawn.cards as Card[]

    let offset = 0
    const assigned = basePlayers.map((p, idx) => {
      const cnt = holeCounts[idx]
      const slice = cards.slice(offset, offset + cnt)
      offset += cnt
      return { ...p, cards: slice, bonusCardNextRound: false }
    })

    let potAcc = 0
    assigned.forEach(p => {
      const pay = Math.min(p.chips, ante)
      p.chips -= pay
      p.currentBet = pay
      potAcc += pay
    })

    const nPlayers = assigned.length
    const newDealer = (dealerIndex + 1) % nPlayers
    setDealerIndex(newDealer)

    const sbIdx = (newDealer + 1) % nPlayers
    const bbIdx = (newDealer + 2) % nPlayers

    
    let blindTotal = 0
    const withBlinds = assigned.map((p, i) => {
      if (i === sbIdx) {
        const pay = Math.min(p.chips, smallBlind)
        blindTotal += pay
        return { ...p, chips: p.chips - pay, currentBet: (p.currentBet || 0) + pay }
      }
      if (i === bbIdx) {
        const pay = Math.min(p.chips, bigBlind)
        blindTotal += pay
        return { ...p, chips: p.chips - pay, currentBet: (p.currentBet || 0) + pay }
      }
      return p
    })

  setPlayers(withBlinds)
  setCommunity([])
    
    setPot(potAcc + blindTotal)
   
    setCurrentBetToCall(withBlinds[bbIdx]?.currentBet || 0)
    const firstToAct = (bbIdx + 1) % nPlayers
  playersToActRef.current = withBlinds.filter(p => !p.folded).length - 1
    setCurrentPlayer(firstToAct)
    setRunning(false)
    setStage('preflop')
    setMessage('Pre-flop: betting round starts.')
  }

  function advanceToNext(idx: number) {
    if (players.length === 0) return null
    let i = idx
    for (let k = 0; k < players.length; k++) {
      i = (i + 1) % players.length
      if (!players[i].folded) return i
    }
    return null
  }

  function endRoundWonBy(winnerId: number, reason = 'win') {
    setPlayers(prev => prev.map(p => p.id === winnerId ? { ...p, chips: p.chips + pot } : p))
    setMessage(`${players.find(p => p.id === winnerId)?.name || 'Player'} wins the pot (${pot}) — ${reason}`)
    setTimeout(() => {
      setPot(0)
      setCommunity([])
      setPlayers(prev => prev.map(p => ({ ...p, cards: [], folded: false, currentBet: 0, revealed: false })))
      setCurrentPlayer(null)
      setCurrentBetToCall(0)
      playersToActRef.current = 0
      setStage('idle')
      setPhaseCount(0)
      setShowdownAvailable(false)
      setDeckId(null)
    }, 900)
  }

  function finishShowdown() {
    const contenders = players.filter(p => !p.folded)
    if (contenders.length === 0) { setMessage('All folded. No winner.'); return }
    let bestPlayer = contenders[0]
    let bestEval = evaluateBestHand(bestPlayer.cards.concat(community))
    for (const p of contenders.slice(1)) {
      const ev = evaluateBestHand(p.cards.concat(community))
      if (compareHand(ev, bestEval) > 0) { bestPlayer = p; bestEval = ev }
    }
    endRoundWonBy(bestPlayer.id, 'showdown')
  }

  function cpuAct(idx: number) {
    const p = players[idx]
    if (!p || p.folded) return
    const toCall = currentBetToCall - p.currentBet
    const combined = p.cards.concat(community)
    const maxRank = combined.length ? Math.max(...combined.map(rankValue)) : 0
    const r = Math.random()

    if (p.chips <= toCall) {
      if (r < 0.3) {
        doFold(idx)
      } else {
        doCall(idx)
      }
      return
    }

    if (maxRank >= 13 && r > 0.25) {
      const raiseBy = Math.min(p.chips - toCall, Math.max(ante, Math.floor(p.chips * 0.2)))
      if (raiseBy >= ante && r > 0.6) {
        doRaise(idx, raiseBy)
        return
      }
      doCall(idx)
      return
    }

    if (maxRank >= 11 && r > 0.4) {
      doCall(idx); return
    }

    if (r < 0.35) { doFold(idx); return }
    doCall(idx)
  }

  function doFold(idx: number) {
    const foldedPlayer = players[idx]
    setPlayers(prev => {
      const next = prev.map(p => p.id === prev[idx].id ? { ...p, folded: true, revealed: p.isCpu ? true : p.revealed } : p)
      return next
    })
  playersToActRef.current = Math.max(0, playersToActRef.current - 1)
    const activeBefore = players.filter(p => !p.folded).length
    const activeAfter = Math.max(0, activeBefore - 1)
    if (activeAfter === 1) {
      const winner = players.find(p => !p.folded && p.id !== foldedPlayer.id)
      if (winner) { endRoundWonBy(winner.id, 'all others folded'); return }
    }

    if (foldedPlayer && foldedPlayer.isCpu) {
      setMessage(`${foldedPlayer.name} folded and revealed cards.`)
    }
    const active = players.filter(p => !p.folded).length
    if (active <= 1) {
      const winner = players.find(p => !p.folded)
      if (winner) { endRoundWonBy(winner.id, 'all others folded'); return }
    }
    const next = advanceToNext(idx)
    if (next == null) return
    setCurrentPlayer(next)
    checkAdvanceStage()
  }

  function doCall(idx: number) {
    setPlayers(prev => {
      const p = prev[idx]
      if (!p) return prev
      const toCall = currentBetToCall - p.currentBet
      const pay = Math.min(p.chips, toCall)
      const next = prev.map((pl, i) => i === idx ? { ...pl, chips: pl.chips - pay, currentBet: pl.currentBet + pay, bonusCardNextRound: true } : pl)
      setPot(old => old + pay)
      return next
    })
  playersToActRef.current = Math.max(0, playersToActRef.current - 1)
    const next = advanceToNext(idx)
    if (next == null) return
    setCurrentPlayer(next)
  checkAdvanceStage()
  }

  function doRaise(idx: number, raiseBy: number) {
    setPlayers(prev => {
      const p = prev[idx]
      if (!p) return prev
      const toCall = currentBetToCall - p.currentBet
      const total = toCall + raiseBy
      const pay = Math.min(p.chips, total)
      const next = prev.map((pl, i) => i === idx ? { ...pl, chips: pl.chips - pay, currentBet: pl.currentBet + pay } : pl)
      setPot(old => old + pay)
      return next
    })
    setCurrentBetToCall(old => old + raiseBy)
    const activeCount = players.filter(p => !p.folded).length
  playersToActRef.current = activeCount - 1
    const next = advanceToNext(idx)
    if (next == null) return
    setCurrentPlayer(next)
    if (stage === 'preflop' && next === 0) {
      dealCommunity(3)
      setStage('flop')
      setMessage('Flop revealed. New betting round.')
  playersToActRef.current = players.filter(p => !p.folded).length
    } else if (stage === 'flop' && next === 0) {
      dealCommunity(1)
      setStage('turn')
      setMessage('Turn revealed. New betting round.')
  playersToActRef.current = players.filter(p => !p.folded).length
    } else if (stage === 'turn' && next === 0) {
      dealCommunity(1)
      setStage('river')
      setMessage('River revealed. New betting round.')
  playersToActRef.current = players.filter(p => !p.folded).length
    } else if (stage === 'river' && next === 0) {
      
      setShowdownAvailable(true)
      setMessage('Showdown is available. The player must initiate the showdown when ready.')
    }
  }

  function checkAdvanceStage() {
    const remain = Math.max(0, playersToActRef.current - 1)
    playersToActRef.current = remain
        if (remain <= 0) {
          if (stage === 'preflop') {
            dealCommunity(3); setStage('flop'); setPhaseCount(c => c + 1); setMessage('Flop revealed. Betting round starts.');
            setPlayers(prev => prev.map(p => ({ ...p, currentBet: 0 })))
            playersToActRef.current = players.filter(p => !p.folded).length
          } else if (stage === 'flop') {
            dealCommunity(1); setStage('turn'); setPhaseCount(c => c + 1); setMessage('Turn revealed. Betting round starts.');
            setPlayers(prev => prev.map(p => ({ ...p, currentBet: 0 })))
            playersToActRef.current = players.filter(p => !p.folded).length
          } else if (stage === 'turn') {
            dealCommunity(1); setStage('river'); setPhaseCount(c => c + 1); setMessage('River revealed. Betting round starts.');
            setPlayers(prev => prev.map(p => ({ ...p, currentBet: 0 })))
            playersToActRef.current = players.filter(p => !p.folded).length
          } else if (stage === 'river') {
            setShowdownAvailable(true)
            setMessage('Showdown is available. The player must initiate the showdown when ready.')
          }
      }
  }

  async function dealCommunity(count: number) {
    if (!deckId) return
    const d = await draw(deckId, count)
    const cards = d.cards as Card[]
    setCommunity(prev => prev.concat(cards))
  }

  function onFold() {
    if (currentPlayer !== 0) return
    doFold(0)
  }

  function onCall() {
    if (currentPlayer !== 0) return
    doCall(0)
  }

  function onRaise() {
    if (currentPlayer !== 0) return
    const raiseBy = Math.max(ante, Math.floor(Number(raiseInput) || 0))
    doRaise(0, raiseBy)
  }

  return (
    <div className="poker-container">
      <div className="controls">
        <label>
          CPU opponents:
          <input className="small-input" type="number" min={1} max={6} value={numCpu} onChange={(e) => setNumCpu(Number(e.target.value))} />
        </label>
        <label>
          Bet:
          <input className="small-input" type="number" min={1} value={ante} onChange={(e) => setAnte(Number(e.target.value))} />
        </label>
        <button className="btn" onClick={startRound} disabled={running || currentPlayer !== null}>Start Round</button>
      </div>

      <div className="center big">Pot: {pot}</div>
  <div className="center">Stage: {stage} {phaseCount > 0 ? `(phases: ${phaseCount})` : ''}</div>

      <div className="center" style={{ marginTop: 8 }}>
        
        <div className="cards">
          {community.length ? community.map((c, i) => (
            <img key={i} className="card-img" src={c.image} alt="community" />
          )) : <div style={{ color: '#ddd' }}>No cards yet</div>}
        </div>
      </div>

      <div className="players" style={{ marginTop: 12 }}>
        {players.map((p, i) => (
          <div key={p.id} className="player-card" style={{ border: currentPlayer === i ? '2px solid #0ea5a4' : undefined }}>
            <div className="big">{p.name} {p.isCpu ? '(CPU)' : ''}</div>
            <div>Chips: {p.chips}</div>
            <div>Current Bet: {p.currentBet}</div>
            <div className="cards">
              {p.cards && p.cards.length ? (
                p.isCpu && !p.revealed ? (
                  p.cards.map((_c, idx2) => (
                    <div key={idx2} className="face-down"></div>
                  ))
                ) : (
                  p.cards.map((c, idx2) => (
                    <img key={idx2} className="card-img" src={c.image} alt={`${c.value} of ${c.suit}`} />
                  ))
                )
              ) : <div className="face-down"></div>}
            </div>
            <div className="status">{p.folded ? 'Folded' : (currentPlayer === i ? 'To act' : 'Waiting')}</div>
          </div>
        ))}
      </div>

      <div className="actions">
        <div className="center">
          <div>Current to call: {currentBetToCall}</div>
          <div style={{ marginTop: 8 }}>
            <button className="btn" onClick={onFold} disabled={currentPlayer !== 0}>Fold</button>
            <button className="btn" onClick={onCall} disabled={currentPlayer !== 0} style={{ marginLeft: 8 }}>Call</button>
            <input className="small-input" type="number" value={raiseInput} onChange={(e) => setRaiseInput(Number(e.target.value))} style={{ marginLeft: 8 }} />
            <button className="btn" onClick={onRaise} disabled={currentPlayer !== 0} style={{ marginLeft: 8 }}>Raise</button>
            <button className="btn" onClick={() => { if (showdownAvailable) { finishShowdown(); setShowdownAvailable(false) } }} disabled={!showdownAvailable} style={{ marginLeft: 8 }}>Start Showdown</button>
          </div>
        </div>
      </div>

      {message && <div className="result">{message}</div>}
    </div>
  )
}
