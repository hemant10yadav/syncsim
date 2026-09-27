import { ENGINE_VERSION } from '@syncsim/engine'

function App() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
      <h1>syncsim</h1>
      <p>Offline-first sync simulator. Engine v{ENGINE_VERSION}.</p>
    </main>
  )
}

export default App
