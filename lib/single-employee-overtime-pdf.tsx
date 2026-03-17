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

export async function generateSingleEmployeeOvertimeReportPDF(
  employeeName: string, 
  entries: OvertimeEntry[], 
  filterMonth: string
): Promise<void> {
  // Debug: Log the received data
  console.log("PDF Generator - Employee Name:", employeeName)
  console.log("PDF Generator - Filter Month:", filterMonth)
  console.log("PDF Generator - Entries:", entries)
  console.log("PDF Generator - Entries length:", entries.length)

  const logoUrl = `${window.location.origin}/hr-overtime-logo.png`

  // Generate summary table rows - group by date and merge reasons
  const summaryRows = entries.map((entry, index) => {
    const rowColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa'
    
    console.log(`Processing entry ${index + 1}:`, {
      id: entry.id,
      date: entry.date,
      employeeDetails: entry.employeeDetails,
      reasons: entry.reasons,
      employeeName: employeeName
    })
    
    // Check if we have individual employee details for this employee
    if (entry.employeeDetails && entry.employeeDetails.length > 0) {
      console.log("Found employeeDetails, searching for:", employeeName)
      // Find the current employee's details - try exact match first, then partial match
      let empDetail = entry.employeeDetails.find(emp => emp.employeeName === employeeName)
      
      if (!empDetail) {
        // Try partial match (in case of different formatting)
        empDetail = entry.employeeDetails.find(emp => 
          emp.employeeName.includes(employeeName) || employeeName.includes(emp.employeeName)
        )
      }
      
      console.log("Found empDetail:", empDetail)
      if (empDetail) {
        // Use individual employee reasons only
        const reasons = empDetail.reasons.join(', ')
        console.log("Using individual reasons:", reasons)
        return `
          <tr style="background-color: ${rowColor};">
            <td style="padding: 8px; text-align: center; border: 1px solid #000;">${convertNumbersToEnglish(entry.date)}</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #000;">${convertNumbersToEnglish(empDetail.fromTime)} - ${convertNumbersToEnglish(empDetail.toTime)}</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #000; font-weight: bold;">${convertNumbersToEnglish(empDetail.totalHours)} Hr</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #000;">${reasons}</td>
          </tr>
        `
      } else {
        console.log("No empDetail found for employee:", employeeName)
      }
    } else {
      console.log("No employeeDetails found in entry")
    }
    
    // Fallback to general reasons (only if no individual details found)
    const reasons = (entry.reasons || [(entry as any).reason].filter(Boolean)).join(', ')
    console.log("Using general reasons:", reasons)
    return `
      <tr style="background-color: ${rowColor};">
        <td style="padding: 8px; text-align: center; border: 1px solid #000;">${convertNumbersToEnglish(entry.date)}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #000;">${convertNumbersToEnglish(entry.fromTime)} - ${convertNumbersToEnglish(entry.toTime)}</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #000; font-weight: bold;">${convertNumbersToEnglish(entry.totalHours)} Hr</td>
        <td style="padding: 8px; text-align: center; border: 1px solid #000;">${reasons}</td>
      </tr>
    `
  }).join("")

  const totalHours = entries.reduce((sum, entry) => {
    // If we have individual employee details, use the specific employee's hours
    if (entry.employeeDetails && entry.employeeDetails.length > 0) {
      const empDetail = entry.employeeDetails.find(emp => emp.employeeName === employeeName)
      if (empDetail) {
        return sum + empDetail.totalHours
      }
    }
    // Fallback to general totalHours
    return sum + (entry.totalHours || 0)
  }, 0)

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 15mm; }
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
          <div class="title">تقرير الساعات الإضافية للموظف / Employee Overtime Report</div>
        </div>
        
        <div class="employee-info">
          اسم الموظف / Employee: ${employeeName}<br>
          للشهر / For Month: ${convertNumbersToEnglish(filterMonth)}
        </div>

        <table>
          <thead>
            <tr>
              <th>التاريخ / Date</th>
              <th>الوقت / Time</th>
              <th>الساعات / Hours</th>
              <th>سبب الساعات الإضافية / Overtime Reason</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows || '<tr><td colspan="4" style="text-align: center; padding: 20px;">لا توجد بيانات / No Data</td></tr>'}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="3" style="text-align: left; padding-left: 15px;">الإجمالي / Total:</td>
              <td style="font-weight: bold; font-size: 14px;">${convertNumbersToEnglish(totalHours)} Hr</td>
            </tr>
          </tfoot>
        </table>

        <div class="footer">
          تاريخ الطباعة / Print Date: ${new Date().toLocaleDateString('ar-SA')}
        </div>
      </body>
    </html>
  `
  
  openPrintWindow(html, `Overtime Report - ${employeeName}`)
}
