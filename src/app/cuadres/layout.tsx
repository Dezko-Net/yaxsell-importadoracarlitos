'use client'

import React from 'react'
import ErpDashboardLayout from '@/app/erp-dashboard/layout'

export default function ErpLayout({ children }: { children: React.ReactNode }) {
  return <ErpDashboardLayout>{children}</ErpDashboardLayout>
}
