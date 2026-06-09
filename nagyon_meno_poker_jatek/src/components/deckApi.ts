const BASE = 'https://deckofcardsapi.com/api/deck'

export async function newDeck(shuffle = true, decks = 1) {
  const res = await fetch(`${BASE}/new/${shuffle ? 'shuffle/' : ''}?deck_count=${decks}`)
  return res.json()
}

export async function draw(deck_id: string, count = 1) {
  const res = await fetch(`${BASE}/${deck_id}/draw/?count=${count}`)
  return res.json()
}
