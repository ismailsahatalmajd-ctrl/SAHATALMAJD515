import { OvertimeEntry, AbsenceRecord } from "./types"
import { convertNumbersToEnglish } from "./utils"

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

const typeLabelsAr: Record<string, string> = {
  absence: "غياب",
  leave: "إجازة",
  official_event: "مناسبة رسمية"
}

const categoryLabelsAr: Record<string, string> = {
  unexcused: "بدون عذر",
  excused: "بعذر",
  sick: "مرضي",
  official: "رسمية",
  eid: "عيد",
  national: "يوم وطني",
  work_visit: "زيارة عمل",
  training: "تدريب"
}

export interface CombinedEmployeeData {
  id: string
  name: string
  overtimeEntries: OvertimeEntry[]
  absenceRecords: AbsenceRecord[]
  totalOvertimeHours: number
  totalAbsences: number
  totalLeaves: number
  abs_unexcused: number
  abs_excused: number
  abs_sick: number
}

export async function generateCombinedReportsPDF(
  employeesData: CombinedEmployeeData[],
  month: string,
  reportType: "detailed" | "merged" | "summary"
): Promise<void> {
  const logoUrl = `${window.location.origin}/hr-overtime-logo.png`
  
  let contentHtml = ""

  if (reportType === "summary") {
    const rows = employeesData.map(emp => `
      <tr>
        <td style="font-weight: bold;">${emp.name}</td>
        <td style="color: #1d4ed8; font-weight: bold; text-align: center;">${convertNumbersToEnglish(emp.totalOvertimeHours)}</td>
        <td style="font-weight: bold; text-align: center;">${convertNumbersToEnglish(emp.abs_unexcused)}</td>
        <td style="font-weight: bold; text-align: center;">${convertNumbersToEnglish(emp.abs_excused)}</td>
        <td style="font-weight: bold; text-align: center;">${convertNumbersToEnglish(emp.abs_sick)}</td>
        <td style="color: #b45309; font-weight: bold; text-align: center;">${convertNumbersToEnglish(emp.totalLeaves)}</td>
      </tr>
    `).join("")

    contentHtml = `
      <div class="report-title">تقرير الموظفين (مختصر) | Summary Report</div>
      <div class="info-grid">
         <div class="info-item" style="text-align:center; width:100%;">
           <span class="info-label">الشهر / Month</span>
           <span class="info-val" style="direction:ltr;">${convertNumbersToEnglish(month)}</span>
         </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th style="width: 25%">اسم الموظف / Employee Name</th>
            <th style="width: 15%; text-align: center;">الإضافي<br/><span style="font-size: 10px;">Overtime Hr</span></th>
            <th style="width: 15%; text-align: center;">غياب بدون عذر<br/><span style="font-size: 10px;">Unexcused</span></th>
            <th style="width: 15%; text-align: center;">غياب بعذر<br/><span style="font-size: 10px;">Excused</span></th>
            <th style="width: 15%; text-align: center;">مرضي<br/><span style="font-size: 10px;">Sick</span></th>
            <th style="width: 15%; text-align: center;">إجازات أخرى<br/><span style="font-size: 10px;">Leaves</span></th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr style="background-color: #f1f5f9; font-weight: bold;">
            <td>الإجمالي الكلي / Grand Total</td>
            <td style="color: #1d4ed8; text-align: center;">${convertNumbersToEnglish(employeesData.reduce((s, e) => s + e.totalOvertimeHours, 0))}</td>
            <td style="text-align: center;">${convertNumbersToEnglish(employeesData.reduce((s, e) => s + e.abs_unexcused, 0))}</td>
            <td style="text-align: center;">${convertNumbersToEnglish(employeesData.reduce((s, e) => s + e.abs_excused, 0))}</td>
            <td style="text-align: center;">${convertNumbersToEnglish(employeesData.reduce((s, e) => s + e.abs_sick, 0))}</td>
            <td style="color: #b45309; text-align: center;">${convertNumbersToEnglish(employeesData.reduce((s, e) => s + e.totalLeaves, 0))}</td>
          </tr>
        </tbody>
      </table>
    `
  } else if (reportType === "merged") {
    const rows = employeesData.map(emp => `
      <tr>
        <td style="font-weight: bold;">${emp.name}</td>
        <td style="color: #1d4ed8; font-weight: bold;">${convertNumbersToEnglish(emp.totalOvertimeHours)} Hr</td>
        <td style="color: #b91c1c; font-weight: bold;">${convertNumbersToEnglish(emp.totalAbsences)}</td>
        <td style="color: #b45309; font-weight: bold;">${convertNumbersToEnglish(emp.totalLeaves)}</td>
      </tr>
    `).join("")

    contentHtml = `
      <div class="report-title">تقرير الموظفين الشامل (مدمج) | Combined Monthly Report (Merged)</div>
      <div class="info-grid">
         <div class="info-item" style="text-align:center; width:100%;">
           <span class="info-label">الشهر / Month</span>
           <span class="info-val" style="direction:ltr;">${convertNumbersToEnglish(month)}</span>
         </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th style="width: 40%">اسم الموظف / Employee Name</th>
            <th style="width: 20%">إجمالي الإضافي / Overtime</th>
            <th style="width: 20%">أيام الغياب / Absences</th>
            <th style="width: 20%">الإجازات / Leaves</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr style="background-color: #f1f5f9; font-weight: bold;">
            <td>الإجمالي الكلي / Grand Total</td>
            <td style="color: #1d4ed8;">${convertNumbersToEnglish(employeesData.reduce((s, e) => s + e.totalOvertimeHours, 0))} Hr</td>
            <td style="color: #b91c1c;">${convertNumbersToEnglish(employeesData.reduce((s, e) => s + e.totalAbsences, 0))}</td>
            <td style="color: #b45309;">${convertNumbersToEnglish(employeesData.reduce((s, e) => s + e.totalLeaves, 0))}</td>
          </tr>
        </tbody>
      </table>
    `
  } else {
    // Detailed Report
    contentHtml = employeesData.map((emp, index) => {
      const otRowsHtml = emp.overtimeEntries.length > 0 ? emp.overtimeEntries.map(e => {
        const eReasons = e.reasons || [(e as any).reason].filter(Boolean)
        return `
          <tr>
            <td>${convertNumbersToEnglish(e.date || '')}</td>
            <td style="direction: ltr;">${convertNumbersToEnglish(e.fromTime || '')} - ${convertNumbersToEnglish(e.toTime || '')}</td>
            <td style="font-weight:bold;">${convertNumbersToEnglish(e.totalHours || 0)}</td>
            <td style="font-size: 11px;">${eReasons.join(" / ")}</td>
          </tr>
        `
      }).join("") : '<tr><td colspan="4" style="text-align:center; padding: 15px;">لا يوجد سجل إضافي هذا الشهر</td></tr>'

      const atRowsHtml = emp.absenceRecords.length > 0 ? emp.absenceRecords.map(r => `
        <tr>
          <td>${convertNumbersToEnglish(r.date)}</td>
          <td>${typeLabelsAr[r.type] || r.type}</td>
          <td>${categoryLabelsAr[r.category] || r.category}</td>
          <td style="font-size: 11px;">${r.notes || "-"}</td>
        </tr>
      `).join("") : '<tr><td colspan="4" style="text-align:center; padding: 15px;">لا توجد غيابات أو إجازات هذا الشهر</td></tr>'

      return `
        <div class="employee-page" ${index < employeesData.length - 1 ? 'style="page-break-after: always;"' : ''}>
          <div class="report-title">تقرير الموظف الشهري المفصل | Detailed Monthly Report</div>
          
          <div class="info-grid">
             <div class="info-item">
               <span class="info-label">الموظف / Employee</span>
               <span class="info-val">${emp.name}</span>
             </div>
             <div class="info-item" style="text-align:left;">
               <span class="info-label">الشهر / Month</span>
               <span class="info-val" style="direction:ltr;">${convertNumbersToEnglish(month)}</span>
             </div>
          </div>

          <div class="summary-boxes">
            <div class="sum-box ot">
              <div class="info-label">إجمالي الساعات الإضافية</div>
              <div class="sum-val">${convertNumbersToEnglish(emp.totalOvertimeHours)} Hr</div>
            </div>
            <div class="sum-box ab">
              <div class="info-label">أيام الغياب</div>
              <div class="sum-val">${convertNumbersToEnglish(emp.totalAbsences)}</div>
            </div>
            <div class="sum-box lv">
              <div class="info-label">الإجازات والمناسبات</div>
              <div class="sum-val">${convertNumbersToEnglish(emp.totalLeaves)}</div>
            </div>
          </div>

          <div class="section-title">سجل الساعات الإضافية | Overtime Log</div>
          <table>
            <thead>
              <tr>
                <th style="width: 15%">التاريخ</th>
                <th style="width: 25%">الوقت (من - إلى)</th>
                <th style="width: 15%">الساعات</th>
                <th style="width: 45%">الأسباب</th>
              </tr>
            </thead>
            <tbody>
              ${otRowsHtml}
            </tbody>
          </table>

          <div class="section-title" style="background: #0f172a;">سجل الغياب والإجازات | Attendance Log</div>
          <table>
            <thead>
              <tr>
                <th style="width: 15%">التاريخ</th>
                <th style="width: 20%">النوع</th>
                <th style="width: 20%">التصنيف</th>
                <th style="width: 45%">ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              ${atRowsHtml}
            </tbody>
          </table>
          
          <div class="footer">
            <div class="sig-box">
               <div class="sig-line"></div>
               <div class="sig-title">توقيع الموظف / Employee Signature</div>
            </div>
            <div class="sig-box">
               <div class="sig-line"></div>
               <div class="sig-title">توقيع الإدارة / Management Auth</div>
            </div>
          </div>
        </div>
      `
    }).join("")
  }

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 15mm; }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            padding: 0px; 
            direction: rtl; 
            color: #1f2937;
            background: #fff;
          }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; }
          .logo { width: 90px; margin-bottom: 10px; }
          .report-title { text-align:center; font-size: 20px; font-weight: 900; color: #1e3a8a; margin: 5px 0 15px 0; letter-spacing: 0.5px; }
          
          .info-grid {
             display: flex;
             justify-content: space-between;
             background: #f8fafc;
             border: 1px solid #e2e8f0;
             border-radius: 8px;
             padding: 15px 20px;
             margin-bottom: 20px;
          }
          .info-item { display: flex; flex-direction: column; gap: 5px; }
          .info-label { font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; }
          .info-val { font-size: 15px; font-weight: 900; color: #0f172a; }

          .section-title {
            font-size: 14px; font-weight: bold; color: #f8fafc; background: #1e3a8a;
            padding: 8px 15px; border-radius: 6px 6px 0 0; margin-bottom: 0px;
            display: inline-block; width: 100%; box-sizing: border-box;
          }
          
          table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 12px; border: 1px solid #cbd5e1; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: right; }
          th { background-color: #f1f5f9; color: #334155; font-weight: 800; }
          tr:nth-child(even) { background-color: #f8fafc; }

          .summary-boxes { display: flex; gap: 10px; margin-bottom: 25px; }
          .sum-box { flex: 1; border: 2px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; background: #fff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          .sum-box.ot { border-color: #3b82f6; }
          .sum-box.ab { border-color: #ef4444; }
          .sum-box.lv { border-color: #f59e0b; }
          .sum-val { font-size: 20px; font-weight: 900; margin-top: 5px; }
          .ot .sum-val { color: #1d4ed8; }
          .ab .sum-val { color: #b91c1c; }
          .lv .sum-val { color: #b45309; }
          
          .footer { margin-top: 40px; display: flex; justify-content: space-around; }
          .sig-box { text-align: center; }
          .sig-line { width: 180px; border-bottom: 1.5px dashed #94a3b8; margin-bottom: 10px; }
          .sig-title { font-weight: bold; font-size: 12px; color: #475569; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${logoUrl}" class="logo" />
        </div>
        ${contentHtml}
      </body>
    </html>
  `
  openPrintWindow(html, `Combined Report - ${month} - ${reportType}`)
}
