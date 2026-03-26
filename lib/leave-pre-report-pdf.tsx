import { convertNumbersToEnglish } from "./utils";
import { formatDateWithDay } from "../utils/dateFormatter"

interface PlannedLeaveData {
  employeeId: string
  employeeName: string
  startDate: string
  endDate: string
  dates?: string[] // Added for multiple specific dates
  totalDays: number
  leaveType: string
  reason: string
}

const leaveTypeLabelsAr: Record<string, string> = {
  official: "رسمية / Official",
  sick: "مرضية / Sick", 
  personal: "شخصية / Personal",
  eid: "عيد / Eid",
  national: "يوم وطني / National Day",
  maternity: " maternité / Maternity",
  emergency: "طارئة / Emergency"
}

function openPrintWindow(html: string, title: string) {
  if (typeof window === "undefined") return

  const w = window.open("", "_blank")
  if (!w) {
    alert("Please allow popups to print / يرجى السماح بالنوافذ المنبثقة للطباعة")
    return
  }

  w.document.open()
  w.document.write(html)
  w.document.close()
  
  w.document.title = title

  w.onload = () => {
    setTimeout(() => {
      w.print()
    }, 500)
  }
}

export async function generateLeavePreReportPDF(plannedLeaves: PlannedLeaveData[]): Promise<void> {
  const logoUrl = `${window.location.origin}/hr-overtime-logo.png`
  const currentDate = new Date().toLocaleDateString('ar-SA')

  // Helper function to get day names in Arabic
  // Utility to format date with both Arabic and English day names
  // Using formatDateWithDay from utils/dateFormatter.ts

  // Helper function to get day range
  // For single date ranges, we will format start and end dates individually using formatDateWithDay
  const getDayRange = (startDate: string, endDate: string) => {
    if (startDate === endDate) {
      return formatDateWithDay(startDate)
    }
    return `${formatDateWithDay(startDate)} - ${formatDateWithDay(endDate)}`
  }

  const formatDates = (leave: PlannedLeaveData) => {
    if (leave.dates && leave.dates.length > 0) {
      const sorted = [...leave.dates].sort();
      return `<div>${sorted.map(d => `<span style="display:inline-block; margin:2px; padding:4px 8px; background:#f3f4f6; border-radius:6px; font-size:12px; font-weight:500; border:1px solid #e5e7eb;">${formatDateWithDay(d)}</span>`).join('')}</div>`;
    }
    // No explicit dates array – treat startDate/endDate as individual dates
    const dates = [] as string[];
    if (leave.startDate) dates.push(leave.startDate);
    if (leave.endDate && leave.endDate !== leave.startDate) dates.push(leave.endDate);
    const sorted = dates.sort();
    return `<div>${sorted.map(d => `<span style="display:inline-block; margin:2px; padding:4px 8px; background:#f3f4f6; border-radius:6px; font-size:12px; font-weight:500; border:1px solid #e5e7eb;">${formatDateWithDay(d)}</span>`).join('')}</div>`;
  };

  const rowsHtml = plannedLeaves.map((leave, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${leave.employeeName}</td>
      <td style="text-align: right; line-height: 1.5; white-space: normal;">${formatDates(leave)}</td>
      <td class="text-center">${convertNumbersToEnglish(leave.totalDays)}</td>
      <td class="text-center">${leaveTypeLabelsAr[leave.leaveType] || leave.leaveType}</td>
      <td style="white-space: normal;">${leave.reason || "-"}</td>
    </tr>
  `).join("")

  const totalDays = plannedLeaves.reduce((sum, leave) => sum + leave.totalDays, 0)
  const totalEmployees = plannedLeaves.length

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <style>
          @page { 
            size: landscape; 
            margin: 5mm; 
          }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            direction: rtl;
            padding: 15px;
            line-height: 1.2;
            width: 100%;
            box-sizing: border-box;
            margin: 0;
          }
          .header { 
            text-align: center; 
            margin-bottom: 15px; 
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
          }
          .logo { width: 50px; margin-bottom: 5px; }
          .title { 
            font-size: 22px; 
            font-weight: bold; 
            margin: 5px 0;
            color: #1a1a1a;
          }
          .subtitle {
            font-size: 14px;
            color: #666;
            margin-bottom: 5px;
          }
          .summary {
            background: #f8f9fa;
            border: 2px solid #dee2e6;
            border-radius: 8px;
            padding: 15px;
            margin: 15px 0;
            display: flex;
            justify-content: space-around;
            text-align: center;
          }
          .summary-item {
            flex: 1;
          }
          .summary-number {
            font-size: 28px;
            font-weight: bold;
            color: #007bff;
            display: block;
          }
          .summary-label {
            font-size: 12px;
            color: #666;
            margin-top: 3px;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 15px 0;
            font-size: 14px;
            table-layout: fixed;
          }
          th, td { 
            border: 2px solid #000; 
            padding: 10px 12px; 
            text-align: center;
            vertical-align: middle;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
          }
          th { 
            background: #007bff; 
            color: white;
            font-weight: bold;
            font-size: 14px;
          }
          td:first-child, td:nth-child(2) {
            text-align: right;
            font-weight: 500;
          }
          .footer { 
            margin-top: 20px; 
            display: flex; 
            justify-content: space-around; 
            text-align: center;
          }
          .signature { 
            border-top: 2px solid #000; 
            padding-top: 10px; 
            width: 180px; 
            font-size: 14px;
          }
          .date-info {
            text-align: left;
            font-size: 12px;
            color: #666;
            margin-top: 5px;
          }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${logoUrl}" class="logo" />
          <div style="font-weight:bold; font-size:14px;">مستودع ساحة المجد | SAHAT ALMAJD</div>
          <div class="title">تقرير الإجازات المسبق</div>
          <div class="subtitle">Leave Pre-Report</div>
        </div>
        
        <div class="summary">
          <div class="summary-item">
            <span class="summary-number">${convertNumbersToEnglish(totalEmployees)}</span>
            <div class="summary-label">إجمالي الموظفين / Total Employees</div>
          </div>
          <div class="summary-item">
            <span class="summary-number">${convertNumbersToEnglish(totalDays)}</span>
            <div class="summary-label">إجمالي أيام الإجازة / Total Leave Days</div>
          </div>
          <div class="summary-item">
            <span class="summary-number">${convertNumbersToEnglish(Math.round(totalDays / totalEmployees * 10) / 10)}</span>
            <div class="summary-label">متوسط الأيام لكل موظف / Avg Days per Employee</div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th style="width:120px;">اسم الموظف / Employee</th>
              <th style="width:280px;">تواريخ الإجازة / Dates</th>
              <th style="width:50px;">الأيام/Days</th>
              <th style="width:90px;">نوع الإجازة / Type</th>
              <th style="width:110px;">السبب / Reason</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="6" style="text-align: center; padding: 15px;">لا توجد بيانات / No Data</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          <div class="signature">
            <div>إعداد / Prepared By</div>
          </div>
          <div class="signature">
            <div>مراجعة / Reviewed By</div>
          </div>
          <div class="signature">
            <div>اعتماد / Approved By</div>
          </div>
        </div>

        <div class="date-info">
          تاريخ التقرير: ${currentDate} | Report Date: ${currentDate}
        </div>
      </body>
    </html>
  `
  
  openPrintWindow(html, `Leave Pre-Report - ${plannedLeaves.length} Employees`)
}
