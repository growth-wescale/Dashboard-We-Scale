import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Login } from '@/pages/Login'
import { PrivateRoute } from '@/components/PrivateRoute'
import { AppLayout } from '@/components/AppLayout'
import { VisaoGeral } from '@/pages/VisaoGeral'
import { SaudeDaMarca } from '@/pages/SaudeDaMarca'
import { MetaCopaB2B } from '@/pages/MetaCopaB2B'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <AppLayout>
                <Routes>
                  <Route path="/"         element={<VisaoGeral />} />
                  <Route path="/marca"    element={<SaudeDaMarca />} />
                  <Route path="/copa-b2b" element={<MetaCopaB2B />} />
                  <Route path="*"         element={<Navigate to="/" replace />} />
                </Routes>
              </AppLayout>
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
