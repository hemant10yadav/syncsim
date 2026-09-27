import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './approach.css'
import { ApproachPage } from './ApproachPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApproachPage />
  </StrictMode>,
)
