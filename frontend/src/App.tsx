import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from '@/components/Layout'
import AnalysisPage from '@/pages/AnalysisPage'
import DashboardPage from '@/pages/DashboardPage'
import FieldsPage from '@/pages/FieldsPage'
import RecordsPage from '@/pages/RecordsPage'
import ReportPage from '@/pages/ReportPage'
import StatusPage from '@/pages/StatusPage'
import UploadPage from '@/pages/UploadPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<AnalysisPage />} />
          <Route path="pola" element={<FieldsPage />} />
          <Route path="raport/:id" element={<ReportPage />} />
          <Route path="demo" element={<DashboardPage />} />
          <Route path="records" element={<RecordsPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="status" element={<StatusPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
