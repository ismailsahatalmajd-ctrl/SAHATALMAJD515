import type { Branch, Issue, Return } from "./types"
import { formatArabicGregorianDate, formatArabicGregorianTime, formatEnglishNumber, getNumericInvoiceNumber, formatCurrency } from "./utils"
import { getInvoiceSettings } from "./invoice-settings-store"

interface InvoiceItem {
  id: string
  type: 'issue' | 'return'
  branchId: string
  branchName: string
  date: string
  totalValue: number
  productCount: number
  invoiceNumber: string
  products: any[]
}

interface ReportFilters {
  startDate?: string
  endDate?: string
  category?: string
  location?: string
  selectedBranches?: string
}

export async function generateBranchReportPDF(
  branch: Branch, // Can be dummy if multi-branch
  data: InvoiceItem[],
  mode: 'summary' | 'detailed',
  filters: ReportFilters
) {
  const printWindow = window.open("", "_blank")
  if (!printWindow) return
  printWindow.document.write(`
    <div style="font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; gap:20px;">
      <div style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #2563eb; border-radius:50%; animation: spin 1s linear infinite;"></div>
      <p style="color:#64748b;">جاري تجهيز التقرير... (Preparing Report...)</p>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </div>
  `)

  const settings = await getInvoiceSettings()
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'

  // Calculations
  const totalIssues = data.filter(i => i.type === 'issue').reduce((sum, i) => sum + i.totalValue, 0)
  const totalReturns = data.filter(i => i.type === 'return').reduce((sum, i) => sum + i.totalValue, 0)
  const netValue = totalIssues - totalReturns
  const totalInvoices = data.length

  const pdfContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>Branch Report / تقرير الفروع</title>
  <base href="${window.location.origin}/">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      padding: 40px;
      background: white;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
    }
    .header h1 {
      color: #2563eb;
      font-size: 24px;
      margin-bottom: 8px;
    }
    .header p {
      color: #64748b;
      font-size: 14px;
    }
    .filters-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
        background: #f8fafc;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 24px;
        border: 1px solid #e2e8f0;
    }
    .filter-item {
        font-size: 13px;
        color: #475569;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .filter-item strong {
        color: #1e293b;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .summary-card {
      color: white;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
    }
    .summary-card.green { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
    .summary-card.red { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); }
    .summary-card.blue { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
    .value { font-size: 20px; font-weight: bold; }
    .label { font-size: 12px; opacity: 0.9; }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 12px;
    }
    th {
      background: #f1f5f9;
      padding: 10px;
      text-align: right;
      color: #334155;
      font-weight: 600;
      border-bottom: 2px solid #e2e8f0;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
    }
    tr.invoice-row {
        background: #fff;
    }
    tr.invoice-row.return {
        background: #fff5f5;
    }
    .badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: bold;
    }
    .badge.issue { background: #dcfce7; color: #166534; }
    .badge.return { background: #fee2e2; color: #991b1b; }
    
    .invoice-card {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        margin-bottom: 20px;
        overflow: hidden;
        page-break-inside: avoid;
    }
    .invoice-header {
        background: #f8fafc;
        padding: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #e2e8f0;
    }
    .invoice-details {
        padding: 0;
    }
    .invoice-footer {
        background: #f8fafc;
        padding: 8px 12px;
        text-align: left;
        font-weight: bold;
        border-top: 1px solid #e2e8f0;
    }

    .footer {
      margin-top: 50px;
      text-align: center;
      color: #94a3b8;
      font-size: 11px;
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
    }
    @media print {
      body { padding: 20px; }
      .summary-cards { page-break-inside: avoid; }
      .invoice-card { page-break-inside: avoid; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex; align-items:center; justify-content:center; gap:16px;">
      <img src="${logoUrl}" alt="Logo" style="width:50px;height:50px;border-radius:6px;" onerror="this.style.display='none'"/>
      <div>
        <h1>${mode === 'summary' ? 'تقرير الفروع (ملخص)' : 'تقرير الفروع (تفصيلي)'}</h1>
        <h2 style="font-size:16px; color:#64748b; font-weight:normal;">Branch Report - ${mode === 'summary' ? 'Summary' : 'Detailed'}</h2>
      </div>
    </div>
  </div>

  <div class="filters-grid">
    <div class="filter-item">
        <strong>الفروع / Branches</strong>
        <span>${filters.selectedBranches || branch.name || 'All / الكل'}</span>
    </div>
    ${filters.startDate ? `<div class="filter-item"><strong>من / From</strong> <span>${formatArabicGregorianDate(new Date(filters.startDate))}</span></div>` : ''}
    ${filters.endDate ? `<div class="filter-item"><strong>إلى / To</strong> <span>${formatArabicGregorianDate(new Date(filters.endDate))}</span></div>` : ''}
    ${filters.category ? `<div class="filter-item"><strong>التصنيف / Category</strong> <span>${filters.category}</span></div>` : ''}
    ${filters.location ? `<div class="filter-item"><strong>الموقع / Location</strong> <span>${filters.location}</span></div>` : ''}
  </div>

  <div class="summary-cards">
    <div class="summary-card green">
      <div class="label">إجمالي الصرف (Total Issues)</div>
      <div class="value">${formatCurrency(totalIssues)}</div>
    </div>
    <div class="summary-card red">
      <div class="label">إجمالي المرتجع (Total Returns)</div>
      <div class="value">${formatCurrency(totalReturns)}</div>
    </div>
    <div class="summary-card blue">
      <div class="label">الصافي (Net Value)</div>
      <div class="value">${formatCurrency(netValue)}</div>
    </div>
  </div>

  ${mode === 'summary' ? `
    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>رقم الفاتورة <br> Invoice #</th>
                <th>النوع <br> Type</th>
                <th>الفرع <br> Branch</th>
                <th>التاريخ <br> Date</th>
                <th>الأصناف <br> Items</th>
                <th>الإجمالي <br> Total</th>
            </tr>
        </thead>
        <tbody>
            ${data.map((item, idx) => `
                <tr class="invoice-row ${item.type === 'return' ? 'return' : ''}">
                    <td>${formatEnglishNumber(idx + 1)}</td>
                    <td style="font-weight:bold;">${item.invoiceNumber}</td>
                    <td><span class="badge ${item.type}">${item.type === 'issue' ? 'سند صرف' : 'سند مرتجع'}</span></td>
                    <td>${item.branchName}</td>
                    <td>${formatArabicGregorianDate(new Date(item.date))}</td>
                    <td>${formatEnglishNumber(item.productCount)}</td>
                    <td style="font-weight:bold;">${formatCurrency(item.totalValue)}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
  ` : `
    <!-- Detailed Mode: Card Style for each Invoice -->
    <div style="display:flex; flex-direction:column; gap:10px;">
    ${data.map((item, idx) => `
        <div class="invoice-card">
            <div class="invoice-header" style="background: ${item.type === 'issue' ? '#f0fdf4' : '#fef2f2'};">
                <div style="display:flex; align-items:center; gap:10px;">
                    <strong style="font-size:14px;">#${item.invoiceNumber}</strong> 
                    <span class="badge ${item.type}">${item.type === 'issue' ? 'ISSUE / صرف' : 'RETURN / مرتجع'}</span>
                </div>
                <div style="display:flex; align-items:center; gap:15px; font-size:12px; color:#475569;">
                     <span>📅 ${formatArabicGregorianDate(new Date(item.date))}</span>
                     <span>🏢 ${item.branchName}</span>
                </div>
            </div>
            <div class="invoice-details">
                <table style="margin:0;">
                    <thead>
                        <tr>
                             <th style="background:#fff; font-size:11px; padding:6px 10px; width:15%;">الكود / Code</th>
                             <th style="background:#fff; font-size:11px; padding:6px 10px;">المنتج / Product</th>
                             <th style="background:#fff; font-size:11px; padding:6px 10px; width:15%;">الكمية / Qty</th>
                             <th style="background:#fff; font-size:11px; padding:6px 10px; width:15%;">السعر / Price</th>
                             <th style="background:#fff; font-size:11px; padding:6px 10px; width:15%;">الإجمالي / Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${item.products.map((p, pIdx) => `
                            <tr style="background:${pIdx % 2 === 0 ? '#fff' : '#f9fafb'};">
                                <td style="font-family:monospace; padding:4px 10px;">${formatEnglishNumber(p.productCode)}</td>
                                <td style="padding:4px 10px;">${p.productName} 
                                    ${p.category ? `<span style="color:#94a3b8; font-size:10px;">(${p.category})</span>` : ''}
                                </td>
                                <td style="padding:4px 10px;">${formatEnglishNumber(p.quantity)}</td>
                                <td style="padding:4px 10px;">${formatCurrency(p.unitPrice)}</td>
                                <td style="font-weight:500; padding:4px 10px;">${formatCurrency(p.totalPrice)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="invoice-footer">
                <span style="color:#64748b; font-size:11px; margin-left:10px;">Total Amount:</span>
                <span style="font-size:14px;">${formatCurrency(item.totalValue)}</span>
            </div>
        </div>
    `).join('')}
    </div>
  `}

  <div class="footer">
    <p>تم إنشاء هذا التقرير بواسطة نظام سهيل (Soheel System) - ${formatArabicGregorianTime(new Date())}</p>
    <p style="direction:ltr;">Generated by Soheel System</p>
  </div>

  <script>
    window.onload = function() {
      // Auto print
      setTimeout(function() { window.print(); }, 500);
    }
  </script>
</body>
</html>
  `

  printWindow.document.open()
  printWindow.document.write(pdfContent)
  printWindow.document.close()
}
