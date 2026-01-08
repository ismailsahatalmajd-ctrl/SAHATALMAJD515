import type { Branch, Issue, Return } from "./types"
import { formatArabicGregorianDate, formatArabicGregorianTime, formatEnglishNumber, getNumericInvoiceNumber } from "./utils"
import { getInvoiceSettings } from "./invoice-settings-store"

interface ReportFilters {
  startDate?: string
  endDate?: string
  category?: string
}

export async function generateBranchReportPDF(branch: Branch, issues: Issue[], returns: Return[], filters: ReportFilters) {
  const settings = await getInvoiceSettings()
  const totalIssuesValue = issues.reduce((sum, issue) => sum + issue.totalValue, 0)
  const totalReturnsValue = returns.reduce((sum, ret) => sum + ret.totalValue, 0)
  const netValue = totalIssuesValue - totalReturnsValue
  const totalProducts = issues.reduce((sum, issue) => sum + issue.products.length, 0)
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/sahat-almajd-logo.svg` : '/sahat-almajd-logo.svg'

  const pdfContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تقرير فرع ${branch.name}</title>
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
      font-size: 32px;
      margin-bottom: 10px;
    }
    .header p {
      color: #64748b;
      font-size: 14px;
    }
    .branch-info {
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      border-right: 4px solid #2563eb;
    }
    .branch-info h2 {
      color: #1e293b;
      font-size: 20px;
      margin-bottom: 15px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
    }
    .info-item {
      display: flex;
      justify-content: space-between;
      padding: 10px;
      background: white;
      border-radius: 4px;
    }
    .info-label {
      color: #64748b;
      font-size: 14px;
    }
    .info-value {
      color: #1e293b;
      font-weight: 600;
      font-size: 14px;
    }
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .summary-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .summary-card.green {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }
    .summary-card.red {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    }
    .summary-card.blue {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    }
    .summary-card h3 {
      font-size: 12px;
      opacity: 0.9;
      margin-bottom: 10px;
    }
    .summary-card .value {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .summary-card .subtitle {
      font-size: 11px;
      opacity: 0.8;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    thead {
      background: #2563eb;
      color: white;
    }
    th {
      padding: 12px;
      text-align: right;
      font-weight: 600;
      font-size: 13px;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
      font-size: 13px;
    }
    tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .section-title {
      font-size: 20px;
      font-weight: bold;
      color: #1e293b;
      margin: 30px 0 15px 0;
      padding-bottom: 10px;
      border-bottom: 2px solid #e2e8f0;
    }
    .footer {
      margin-top: 50px;
      text-align: center;
      color: #94a3b8;
      font-size: 12px;
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
    }
    .filters-info {
      background: #fef3c7;
      border: 1px solid #fbbf24;
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 20px;
    }
    .filters-info h4 {
      color: #92400e;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .filters-info p {
      color: #78350f;
      font-size: 12px;
      margin: 3px 0;
    }
    @media print {
      body { padding: 20px; }
      .summary-cards { page-break-inside: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex; align-items:center; justify-content:center; gap:12px;">
      <img src="${logoUrl}" alt="مستودع ساحة المجد" style="width:48px;height:48px;border-radius:6px;" onerror="this.style.display='none'"/>
      <div>
        <h1>تقرير فرع ${branch.name}</h1>
        <p>مستودع ساحة المجد - تقرير شامل</p>
      </div>
    </div>
  </div>

  <div class="branch-info">
    <h2>معلومات الفرع</h2>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">اسم الفرع:</span>
        <span class="info-value">${branch.name}</span>
      </div>
      <div class="info-item">
        <span class="info-label">الموقع:</span>
        <span class="info-value">${branch.location}</span>
      </div>
      ${branch.manager
      ? `
      <div class="info-item">
        <span class="info-label">المدير:</span>
        <span class="info-value">${branch.manager}</span>
      </div>
      `
      : ""
    }
      ${branch.phone
      ? `
      <div class="info-item">
        <span class="info-label">الهاتف:</span>
        <span class="info-value">${branch.phone}</span>
      </div>
      `
      : ""
    }
      <div class="info-item">
        <span class="info-label">تاريخ التقرير:</span>
        <span class="info-value">${formatArabicGregorianDate(new Date())}</span>
      </div>
      <div class="info-item">
        <span class="info-label">الوقت:</span>
        <span class="info-value">${formatArabicGregorianTime(new Date())}</span>
      </div>
    </div>
  </div>

  ${filters.startDate || filters.endDate || (filters.category && filters.category !== "all")
      ? `
  <div class="filters-info">
    <h4>الفلاتر المطبقة:</h4>
    ${filters.startDate ? `<p> من تاريخ: ${formatArabicGregorianDate(new Date(filters.startDate))}</p>` : ""}
    ${filters.endDate ? `<p> إلى تاريخ: ${formatArabicGregorianDate(new Date(filters.endDate))}</p>` : ""}
    ${filters.category && filters.category !== "all" ? `<p> التصنيف: ${filters.category}</p>` : ""}
  </div>
  `
      : ""
    }

  <div class="summary-cards">
    ${settings.showTotal ? `
    <div class="summary-card green">
      <h3>إجمالي الصرف</h3>
      <div class="value">${formatEnglishNumber(totalIssuesValue.toFixed(2))}</div>
      <div class="subtitle">${formatEnglishNumber(issues.length)} عملية</div>
    </div>
    <div class="summary-card red">
      <h3>المرتجعات</h3>
      <div class="value">${formatEnglishNumber(totalReturnsValue.toFixed(2))}</div>
      <div class="subtitle">${formatEnglishNumber(returns.length)} عملية</div>
    </div>
    <div class="summary-card blue">
      <h3>صافي القيمة</h3>
      <div class="value">${formatEnglishNumber(netValue.toFixed(2))}</div>
      <div class="subtitle">بعد طرح المرتجعات</div>
    </div>
    ` : ''}
    <div class="summary-card">
      <h3>عدد المنتجات المصروفة</h3>
      <div class="value">${formatEnglishNumber(totalProducts)}</div>
      <div class="subtitle">إجمالي الأصناف</div>
    </div>
  </div>

  <div class="section-title">عمليات الصرف</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>رقم العملية</th>
        <th>التاريخ</th>
        <th>عدد المنتجات</th>
        ${settings.showTotal ? `<th>الإجمالي</th>` : ''}
      </tr>
    </thead>
    <tbody>
      ${issues.map((issue, idx) => `
        <tr>
          <td>${formatEnglishNumber(idx + 1)}</td>
          <td>${getNumericInvoiceNumber(issue.id, new Date(issue.createdAt))}</td>
          <td>${formatArabicGregorianDate(new Date(issue.createdAt))}</td>
          <td>${formatEnglishNumber(issue.products.length)}</td>
          ${settings.showTotal ? `<td>${formatEnglishNumber(issue.totalValue.toFixed(2))}</td>` : ''}
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="section-title">المرتجعات</div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>رقم العملية</th>
        <th>التاريخ</th>
        <th>عدد المنتجات</th>
        ${settings.showTotal ? `<th>الإجمالي</th>` : ''}
      </tr>
    </thead>
    <tbody>
      ${returns.map((ret, idx) => `
        <tr>
          <td>${formatEnglishNumber(idx + 1)}</td>
          <td>${getNumericInvoiceNumber(ret.id, new Date(ret.createdAt))}</td>
          <td>${formatArabicGregorianDate(new Date(ret.createdAt))}</td>
          <td>${formatEnglishNumber(ret.products.length)}</td>
          ${settings.showTotal ? `<td>${formatEnglishNumber(ret.totalValue.toFixed(2))}</td>` : ''}
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="footer">
    <p>تم إنشاء هذا التقرير بواسطة مستودع ساحة المجد</p>
  </div>

  <script>
    window.onload = function() {
      window.print();
    }
  </script>
</body>
</html>
  `

  const printWindow = window.open("", "_blank")
  if (printWindow) {
    printWindow.document.write(pdfContent)
    printWindow.document.close()
  }
}
