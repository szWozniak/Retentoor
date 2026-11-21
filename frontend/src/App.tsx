import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'
import AnalysisPage from '@/pages/AnalysisPage'
import FieldsPage from '@/pages/FieldsPage'
import ReportPage from '@/pages/ReportPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<AnalysisPage />} />
          <Route path="pola" element={<FieldsPage />} />
          <Route path="raport/:id" element={<ReportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
