import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Login } from '@/pages/Login'
import { PrivateRoute } from '@/components/PrivateRoute'
import { AppLayout } from '@/components/AppLayout'
import { VisaoGeral } from '@/pages/VisaoGeral'
import { SaudeDaMarca } from '@/pages/SaudeDaMarca'
import { MetaCopaB2B } from '@/pages/MetaCopaB2B'
import { Cadencias } from '@/pages/Cadencias'
import { SopMarketing } from '@/pages/SopMarketing'
import { FunilVendas } from '@/pages/FunilVendas'
import { PerformanceVendas } from '@/pages/PerformanceVendas'
import { AnalisePerda } from '@/pages/AnalisePerda'
import { AnaliseObjecoes } from '@/pages/AnaliseObjecoes'

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
                  <Route path="/"              element={<VisaoGeral />} />
                  <Route path="/marca"         element={<SaudeDaMarca />} />
                  <Route path="/copa-b2b"      element={<MetaCopaB2B />} />
                  <Route path="/cadencias"     element={<Cadencias />} />
                  <Route path="/sop-marketing" element={<SopMarketing />} />
                  <Route path="/funil-vendas"       element={<FunilVendas />} />
                  <Route path="/performance-vendas" element={<PerformanceVendas />} />
                  <Route path="/analise-objecoes"   element={<AnaliseObjecoes />} />
                  <Route path="/analise-perda"      element={<AnalisePerda />} />
                  <Route path="/esteira-oral-unic" element={<Navigate to="/marca" replace />} />
                  <Route path="*"                 element={<Navigate to="/" replace />} />
                </Routes>
              </AppLayout>
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
