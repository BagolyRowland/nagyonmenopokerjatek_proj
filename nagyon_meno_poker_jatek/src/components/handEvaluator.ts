type Card = { value: string; suit: string; image?: string }

function rankToNumber(v: string) {
  if (v === 'ACE') return 14
  if (v === 'KING') return 13
  if (v === 'QUEEN') return 12
  if (v === 'JACK') return 11
  return parseInt(v, 10)
}

function combinations<T>(arr: T[], k: number): T[][] {
  const res: T[][] = []
  const n = arr.length
  const comb: T[] = []
  function backtrack(start: number, depth: number) {
    if (depth === k) { res.push(comb.slice()); return }
    for (let i = start; i < n; i++) { comb.push(arr[i]); backtrack(i + 1, depth + 1); comb.pop() }
  }
  backtrack(0, 0)
  return res
}

export function evaluateBestHand(cards: Card[]) : number[] {
  if (cards.length < 5) return [0]
  const combs = combinations(cards, 5)
  let best: number[] = [0]
  for (const c of combs) {
    const val = evaluate5(c)
    if (compareHand(val, best) > 0) best = val
  }
  return best
}

function evaluate5(cards: Card[]): number[] {
  const ranks = cards.map(c => rankToNumber(c.value)).sort((a,b)=>b-a)
  const suits = cards.map(c=>c.suit)
  const counts: Record<number, number> = {}
  for (const r of ranks) counts[r] = (counts[r]||0)+1
  const uniques = Object.keys(counts).map(Number).sort((a,b)=>b-a)

  const isFlush = suits.every(s => s === suits[0])

  
  const distinctRanks = Array.from(new Set(ranks))
  distinctRanks.sort((a,b)=>b-a)
  let isStraight = false
  let topStraight = 0
  for (let i=0;i<=distinctRanks.length-5;i++){
    const slice = distinctRanks.slice(i,i+5)
    if (slice[0]-slice[4]===4) { isStraight=true; topStraight = slice[0]; break }
  }
  if (!isStraight && distinctRanks.includes(14)){
    const wheel = [5,4,3,2]
    if (wheel.every(v => distinctRanks.includes(v))) { isStraight = true; topStraight = 5 }
  }

  const freq = Object.entries(counts).map(([k,v])=>({k:Number(k),v})).sort((a,b)=>{ if (b.v===a.v) return b.k - a.k; return b.v - a.v })

  if (isStraight && isFlush) return [8, topStraight]

  if (freq[0].v === 4) return [7, freq[0].k, freq[1].k]

  if (freq[0].v === 3 && freq[1].v >= 2) return [6, freq[0].k, freq[1].k]

  if (isFlush) return [5, ...ranks]

  if (isStraight) return [4, topStraight]

  if (freq[0].v === 3) return [3, freq[0].k, ...uniques.filter(u=>u!==freq[0].k)]

  if (freq[0].v === 2 && freq[1].v === 2) return [2, freq[0].k, freq[1].k, freq[2].k]

  if (freq[0].v === 2) return [1, freq[0].k, ...uniques.filter(u=>u!==freq[0].k)]

  return [0, ...ranks]
}

export function compareHand(a: number[], b: number[]) {
  for (let i=0;i<Math.max(a.length,b.length);i++){
    const av = a[i]||0; const bv = b[i]||0
    if (av>bv) return 1
    if (av<bv) return -1
  }
  return 0
}
