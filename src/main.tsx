import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { seedDatabase } from './db/seed'

async function bootstrap() {
  try {
    await seedDatabase();
  } catch (err) {
    console.error('IndexedDB initialization failed:', err);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap();
