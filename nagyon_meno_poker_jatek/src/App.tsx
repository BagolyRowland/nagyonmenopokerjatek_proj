import './App.css'
import PokerGame from './components/PokerGame'

function App() {
  return (
    <div>
      <header style={{ padding: 12, textAlign: 'center' }}>
        <h1>Poker(DeckOfCardsAPI)</h1>
        <p style={{ opacity: 0.8 }}>With CPU opponents and adjustable stakes.</p>
      </header>
      <main>
        <PokerGame />
      </main>
    </div>
  )
}

export default App
