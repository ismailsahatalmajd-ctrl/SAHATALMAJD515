import { OvertimeEntry } from "./types"
import { convertNumbersToEnglish } from "./utils"

/**
 * Helper to ensure we don't try to open the window multiple times or write before it's ready.
 */
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

export async function generateMultiEmployeeOvertimeReportPDF(
  employeesData: { employeeName: string; entries: OvertimeEntry[] }[],
  filterMonth: string
): Promise<void> {
  const logoUrl = `${window.location.origin}/hr-overtime-logo.png`

  // Generate summary table rows for all employees with merged cells
  let allRows: { employeeName: string; date: string; time: string; hours: number; reason: string }[] = []
  
  employeesData.forEach(employeeData => {
    employeeData.entries.forEach(entry => {
      // Check if we have individual employee details
      if (entry.employeeDetails && entry.employeeDetails.length > 0) {
        // Find the current employee's details
        const empDetail = entry.employeeDetails.find(emp => emp.employeeName === employeeData.employeeName)
        if (empDetail) {
          // Use individual employee reasons and times - all reasons in one row
          allRows.push({
            employeeName: employeeData.employeeName,
            date: entry.date,
            time: `${convertNumbersToEnglish(empDetail.fromTime)} - ${convertNumbersToEnglish(empDetail.toTime)}`,
            hours: empDetail.totalHours,
            reason: empDetail.reasons.join(', ')
          })
        }
      } else {
        // Fallback to general reasons - all reasons in one row
        const reasons = entry.reasons || [(entry as any).reason].filter(Boolean)
        allRows.push({
          employeeName: employeeData.employeeName,
          date: entry.date,
          time: `${convertNumbersToEnglish(entry.fromTime)} - ${convertNumbersToEnglish(entry.toTime)}`,
          hours: entry.totalHours || 0,
          reason: reasons.join(', ')
        })
      }
    })
  })

  // Group consecutive rows by employee and calculate rowspan
  const processedRows = allRows.map((row, index) => {
    const isFirstOccurrence = index === 0 || row.employeeName !== allRows[index - 1].employeeName
    let rowspan = 0
    
    if (isFirstOccurrence) {
      // Count how many consecutive rows have the same employee
      rowspan = 1
      for (let i = index + 1; i < allRows.length; i++) {
        if (allRows[i].employeeName === row.employeeName) {
          rowspan++
        } else {
          break
        }
      }
    }
    
    return {
      ...row,
      showEmployeeName: isFirstOccurrence,
      employeeRowspan: rowspan
    }
  })

  const summaryRows = processedRows.map((row, index) => {
    const rowColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa'
    // Calculate employee total hours for this employee
    const employeeTotalHours = allRows
      .filter(r => r.employeeName === row.employeeName)
      .reduce((sum, r) => sum + r.hours, 0)
    
    return `
    <tr style="background-color: ${rowColor};">
      <td style="padding: 8px; text-align: center; border: 1px solid #000; font-weight: bold;">${index + 1}</td>
      ${row.showEmployeeName ? `<td style="padding: 8px; text-align: center; border: 1px solid #000; background-color: ${rowColor};" rowspan="${row.employeeRowspan}">${row.employeeName}</td>` : ''}
      <td style="padding: 8px; text-align: center; border: 1px solid #000;">${convertNumbersToEnglish(row.date)}</td>
      <td style="padding: 8px; text-align: center; border: 1px solid #000;">${row.time}</td>
      <td style="padding: 8px; text-align: center; border: 1px solid #000; font-weight: bold;">${convertNumbersToEnglish(row.hours)} Hr</td>
      <td style="padding: 8px; text-align: center; border: 1px solid #000;">${row.reason}</td>
      ${row.showEmployeeName ? `<td style="padding: 8px; text-align: center; border: 1px solid #000; background-color: ${rowColor}; font-weight: bold;" rowspan="${row.employeeRowspan}">${convertNumbersToEnglish(employeeTotalHours)} Hr</td>` : ''}
    </tr>
  `
}).join("")

  // Calculate total hours for all employees
  const totalHours = employeesData.reduce((sum, employeeData) => {
    const empTotal = employeeData.entries.reduce((empSum, entry) => {
      // If we have individual employee details, use the specific employee's hours
      if (entry.employeeDetails && entry.employeeDetails.length > 0) {
        const empDetail = entry.employeeDetails.find(emp => emp.employeeName === employeeData.employeeName)
        if (empDetail) {
          return empSum + empDetail.totalHours
        }
      }
      // Fallback to general totalHours
      return empSum + (entry.totalHours || 0)
    }, 0)
    return sum + empTotal
  }, 0)

  // Generate employee summary
  const employeeSummary = employeesData.map((employeeData, index) => {
    const empTotalHours = employeeData.entries.reduce((sum, entry) => {
      // If we have individual employee details, use the specific employee's hours
      if (entry.employeeDetails && entry.employeeDetails.length > 0) {
        const empDetail = entry.employeeDetails.find(emp => emp.employeeName === employeeData.employeeName)
        if (empDetail) {
          return sum + empDetail.totalHours
        }
      }
      // Fallback to general totalHours
      return sum + (entry.totalHours || 0)
    }, 0)
    const rowColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa'
    return `
      <tr style="background-color: ${rowColor};">
        <td style="padding: 8px; text-align: center; border: 1px solid #000;">${employeeData.employeeName}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #000; font-weight: bold;">${convertNumbersToEnglish(employeeData.entries.length)}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #000; font-weight: bold;">${convertNumbersToEnglish(empTotalHours)} Hr</td>
      </tr>
    `
  }).join("")

  const employeeNames = employeesData.map(emp => emp.employeeName).join(", ")

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4 landscape; margin: 15mm; }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            direction: rtl; 
            padding: 20px;
            line-height: 1.4;
          }
          .header { 
            text-align: center; 
            margin-bottom: 20px; 
            border-bottom: 2px solid #000; 
            padding-bottom: 15px; 
          }
          .logo { width: 80px; margin-bottom: 8px; }
          .company-name { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
          .title { font-size: 18px; font-weight: bold; color: #1a2a44; margin: 15px 0; }
          .employee-info { 
            background: #f5f5f5; 
            padding: 10px; 
            border: 1px solid #000; 
            margin-bottom: 15px; 
            text-align: center;
            font-size: 14px;
            font-weight: bold;
          }
          .summary-section { margin-bottom: 20px; }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 20px; 
            font-size: 12px;
          }
          th { 
            background: #1a2a44; 
            color: white; 
            padding: 10px 8px; 
            text-align: center; 
            border: 1px solid #000; 
            font-weight: bold;
          }
          td { 
            padding: 8px; 
            text-align: center; 
            border: 1px solid #000; 
            vertical-align: middle;
          }
          .total-row { 
            background: #f0f0f0; 
            font-weight: bold; 
          }
          .footer { 
            margin-top: 30px; 
            text-align: center; 
            font-size: 11px; 
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${logoUrl}" class="logo" />
          <div class="company-name">مستودع ساحة المجد | SAHAT ALMAJD</div>
          <div class="title">تقرير مجمع للساعات الإضافية / Merged Overtime Report</div>
        </div>
        
        <div class="employee-info">
          للشهر / For Month: ${convertNumbersToEnglish(filterMonth)}
        </div>

        <div class="summary-section">
          <h3 style="text-align: center; margin-bottom: 10px; color: #1a2a44;">ملخص الموظفين / Employee Summary</h3>
          <table>
            <thead>
              <tr>
                <th>اسم الموظف / Employee</th>
                <th>عدد السجلات / Records</th>
                <th>إجمالي الساعات / Total Hours</th>
              </tr>
            </thead>
            <tbody>
              ${employeeSummary || '<tr><td colspan="3" style="text-align: center; padding: 20px;">لا توجد بيانات / No Data</td></tr>'}
            </tbody>
          </table>
        </div>

        <h3 style="text-align: center; margin-bottom: 10px; color: #1a2a44;">تفاصيل الساعات الإضافية / Overtime Details</h3>
        <table>
          <thead>
            <tr>
              <th style="width: 40px;">#</th>
              <th>اسم الموظف / Employee</th>
              <th>التاريخ / Date</th>
              <th>الوقت / Time</th>
              <th>الساعات / Hours</th>
              <th>سبب الساعات الإضافية / Overtime Reason</th>
              <th>إجمالي ساعات الموظف / Employee Total</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows || '<tr><td colspan="7" style="text-align: center; padding: 20px;">لا توجد بيانات / No Data</td></tr>'}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="7" style="font-weight: bold; font-size: 14px; text-align: center; padding: 10px;">الإجمالي الكلي / Grand Total: ${convertNumbersToEnglish(totalHours)} Hr</td>
            </tr>
          </tfoot>
        </table>

        <div class="footer">
          تاريخ الطباعة / Print Date: ${new Date().toLocaleDateString('ar-SA')}
        </div>
      </body>
    </html>
  `
  
  openPrintWindow(html, `Merged Overtime Report - ${filterMonth}`)
}
